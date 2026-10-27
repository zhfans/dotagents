import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Review } from '../types'

// A band above the prompt with one row per repo the commit-reviewer subagent
// reviewed this session: running, PASS, BLOCK, or a blind review (it couldn't
// read the user's messages or the diff). It also watches git commit and flags
// a commit made with no passing review since the repo's last commit. Claude
// Code draws it, so a verdict shows even if the agent's reply buries it.

const rows = atom({ plugin: 'commit-review-band', key: 'rows' } as const, {})
const expanded = atom({ plugin: 'commit-review-band', key: 'expanded' } as const, null)

type Dollar = EngineInterface

const REVIEWER = 'commit-reviewer'
const GIT = '(^|[;&|({\\s])git(?:\\s+-c\\s+\\S+|\\s+-C\\s+(\\S+))*\\s+'
const COMMIT_RE = new RegExp(GIT + 'commit(\\s|$)')

const basename = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path
const isReviewer = (type: string | undefined) => type === REVIEWER || !!type?.endsWith(':' + REVIEWER)

// The brief CLAUDE.md prescribes: "Repo: <path>" and the planned commit message.
export const parseBrief = (prompt: string): { repo: string; subject: string } => {
  const repo = /Repo(?: path)?:\s*(\S+)/i.exec(prompt)?.[1] ?? 'unknown repo'
  const message = /commit message:\s*\n?\s*["“]?([^\n"”]+)/i.exec(prompt)?.[1] ?? ''
  return { repo, subject: message.trim() }
}

// The reviewer's reply: "Verdict: PASS|BLOCK", "Sources: …", "Findings: …".
export const parseReport = (text: string): Pick<Review, 'state' | 'spec' | 'diff' | 'findings'> => {
  const verdict = /Verdict:\W*(PASS|BLOCK)/i.exec(text)?.[1]?.toUpperCase()
  const sources = /Sources:\s*([\s\S]*?)(?=\n\s*Findings:|$)/i.exec(text)?.[1] ?? ''
  const findingsText = /Findings:\s*([\s\S]*?)(?=\n\s*Not checked|$)/i.exec(text)?.[1]?.trim() ?? ''
  const isBlind = /could(?:n'?t| not) (?:get|read|run)|unable to|no readable transcript|was denied/i.test(sources)
  const spec = /["“]([^"”]{3,})["”]/.exec(sources)?.[1]
  const diff = /git diff[^`'".;,)\n]*/.exec(sources)?.[0]?.trim()
  const items = findingsText
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[-*]\s/.test(line))
    .map(line => line.replace(/^[-*]\s+/, ''))
  const first = findingsText.split('\n')[0] ?? ''
  const findings = /^none\b/i.test(findingsText) ? [] : items.length ? items : first ? [first] : []
  const state: Review['state'] = verdict === 'BLOCK' ? 'block' : verdict === 'PASS' && !isBlind ? 'pass' : 'blind'
  return { state, spec, diff, findings }
}

// A subagent's hand-back as delivered: '<agent-message from="<id>">', then the
// report, each line indented by two spaces, after "The report follows:".
export const parseHandback = (text: string): { agentId: string; report: string } | undefined => {
  const agentId = /<agent-message from="([^"]+)"/.exec(text)?.[1]
  const body = /The report follows:\n([\s\S]*?)(?:\n<\/agent-message>|$)/.exec(text)?.[1]
  if (!agentId || !body) {
    return undefined
  }
  return { agentId, report: body.replace(/^ {2}/gm, '').trim() }
}

// The command without heredoc bodies and quoted strings, so text that only
// mentions git commit (a message, a tag note) doesn't count as one.
export const commandWords = (command: string): string =>
  command
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2(?=\n|$)/g, '$3')
    .replace(/'[^']*'/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '')

// A git commit that made a commit: not a dry run, not one with nothing to commit.
export const isCommit = (command: string, output: string): boolean =>
  COMMIT_RE.test(commandWords(command)) &&
  !/\s--dry-run(\s|$)/.test(command) &&
  !/nothing to commit|no changes added to commit/.test(output)

// The repo a git commit ran in: a -C path, else a cd before it, else the session's.
export const commitRepo = (command: string): string | undefined => {
  const words = commandWords(command)
  return COMMIT_RE.exec(words)?.[2] ?? /(?:^|[;&|\n]\s*)cd\s+(\S+)\s*(?:&&|;|\n)[\s\S]*\bgit\b/.exec(words)?.[1]
}

// A repo named by a path; "." and "./" are the session's own directory, and a
// git worktree is named after its main repo (its .git file points there).
const repoName = async ($: Dollar, path: string): Promise<string> => {
  const dir = /^\.\/?$/.test(path) ? await $.session.cwd() : path
  try {
    const main = /gitdir:\s*(.+?)\/\.git\/worktrees\//.exec(await $.fs.read(`${dir}/.git`))?.[1]
    if (main) {
      return basename(main)
    }
  } catch {
    // .git is a directory (a main checkout) or unreadable: the folder names it.
  }
  return basename(dir)
}

// Agent id -> repo and subject from the brief, until the reviewer reports.
// In session state, so a reload of the mod mid-review doesn't lose it.
const briefs = atom({ plugin: 'commit-review-band', key: 'briefs' } as const, {})

// Records the report of the review agentId started; false when that agent
// isn't an open review (another subagent's report).
async function finish($: Dollar, agentId: string, report: string): Promise<boolean> {
  const brief = (await read($, briefs))[agentId]
  if (!brief) {
    return false
  }
  await update($, briefs, all => Object.fromEntries(Object.entries(all).filter(([id]) => id !== agentId)))
  const review: Review = { ...brief, ...parseReport(report), report }
  await update($, rows, all => ({ ...all, [review.repo]: review }))
  if (review.state !== 'pass') {
    $.ui.toast(`Commit review ${review.state === 'block' ? 'BLOCK' : 'blind'}: ${review.repo}`)
  }
  return true
}

export const register: Register = on => {
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (isReviewer(e.subagentType) && spawned.agentId) {
      const parsed = parseBrief(e.prompt)
      const brief = { ...parsed, repo: await repoName($, parsed.repo) }
      const agentId = spawned.agentId
      await update($, briefs, all => ({ ...all, [agentId]: brief }))
      await update($, rows, all => ({ ...all, [brief.repo]: { ...brief, state: 'running' as const, findings: [] } }))
    }
    return spawned
  })

  // Where it reaches this mod: another plugin may answer SubagentStop first,
  // and a background reviewer ends through its hand-back (prompt.submit below).
  on('classic.SubagentStop', async ($, e, next) => {
    if (isReviewer(e.agent_type) && e.last_assistant_message) {
      await finish($, e.agent_id, e.last_assistant_message)
    }
    return next(e)
  })


  // The reviewer reports by calling SubagentHandback in its own loop, foreground
  // or background, however the report is then delivered (a hand-back that
  // arrives mid-turn reaches no prompt.submit hook). Not a public tool name,
  // hence the regex matcher and the cast.
  on('tool.call', { tool: /^SubagentHandback$/ }, async ($, e, next) => {
    const message = (e as { message?: unknown }).message
    if (e.agentId && typeof message === 'string' && /Verdict:/.test(message)) {
      await finish($, e.agentId, message)
    }
    return next(e)
  })

  // A reviewer that ends with plain text instead.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId && /Verdict:/.test(e.answer)) {
      await finish($, e.agentId, e.answer)
    }
    return next(e)
  })

  // A foreground reviewer's report comes back as the Agent tool's result.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ran = await next(e)
    // The tool's record (BuiltinToolResults.Agent) isn't narrowed by the matcher.
    const result = ran.result as { agentId?: string; content?: { text?: string }[] } | undefined
    const text = (result?.content ?? []).map(block => block.text ?? '').join('\n')
    if (isReviewer(e.subagent_type) && result?.agentId && /Verdict:/.test(text)) {
      await finish($, result.agentId, text)
    }
    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError || !isCommit(e.command, ran.result?.stdout ?? '')) {
      return ran
    }
    const repo = await repoName($, commitRepo(e.command) ?? '.')
    const sha = /\[[^\]\n]*? ([0-9a-f]{7,40})\]/.exec(ran.result?.stdout ?? '')?.[1] ?? ''
    const row = (await read($, rows))[repo]
    const isReviewed = row && (row.state === 'pass' || row.state === 'blind') && row.committed === undefined
    if (isReviewed) {
      await update($, rows, all => ({ ...all, [repo]: { ...row, committed: sha } }))
    } else {
      await update($, rows, all => ({
        ...all,
        [repo]: { repo, subject: sha, state: 'unreviewed' as const, findings: [], committed: sha },
      }))
      $.ui.toast(`Commit without a passing review: ${repo}`)
    }
    return ran
  })

  // Committed PASS rows have done their job; drop them when the user writes next.
  on('prompt.submit', async ($, e, next) => {
    // A background reviewer's report arrives as a prompt from a peer, not
    // through session.receive.
    const handback = e.origin?.kind === 'peer' ? parseHandback(e.text) : undefined
    if (handback && (await finish($, handback.agentId, handback.report))) {
      return next(e)
    }
    await update($, rows, all =>
      Object.fromEntries(Object.entries(all).filter(([, r]) => !(r.state === 'pass' && r.committed !== undefined))),
    )
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const all = Object.values(await read($, rows))
    // What the plugins beneath draw (ponytail's band, say) stays below ours.
    const below = await next(e)
    if (e.props.hasSurvey) {
      return below
    }
    const open = all.length ? await read($, expanded) : null
    const { Box, Button, Text } = $.ui.resolve(e)
    const dismiss = (repo: string) =>
      update($, rows, current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== repo)))

    return (
      <Box flexDirection="column">
        {/* Space between rows, and below them, apart from the band beneath. */}
        <Box flexDirection="column" rowGap="sm" marginBottom="lg">
          {/* An idle row, so the band shows the mod is loaded with nothing to show. */}
          {all.length === 0 ? <Text dimColor>· commit review · no open reviews</Text> : null}
          {all.map(r => {
            const [icon, color, label] = {
              running: ['⏳', 'subtle', 'reviewing'],
              pass: ['✅', 'success', 'PASS'],
              block: ['⛔', 'error', 'BLOCK'],
              blind: ['⚠️', 'warning', 'PASS, but blind'],
              unreviewed: ['⚠️', 'warning', 'committed with no passing review'],
            }[r.state]
            const detail =
              r.state === 'running'
                ? `"${r.subject}"`
                : r.state === 'block'
                  ? `${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}: ${r.findings[0] ?? ''}`
                  : r.state === 'unreviewed'
                    ? r.committed || 'see git log'
                    : [r.spec && `checked against "${r.spec}"`, r.diff, r.committed !== undefined && `committed ${r.committed}`]
                        .filter(Boolean)
                        .join(' · ')
            const isOpen = open === r.repo && !!r.report
            return (
              <Box key={r.repo} flexDirection="column">
                {/* The text takes the width and wraps; the buttons keep to the right
                    edge at the height of the first line, so every row's line up. */}
                <Box alignItems="flex-start" justifyContent="space-between" columnGap="sm">
                  <Box flexGrow={1} flexShrink={1}>
                    <Text color={color} dimColor={r.committed !== undefined && r.state === 'pass'} wrap="wrap">
                      {icon} {r.repo} · {label}
                      {detail ? ` · ${detail}` : ''}
                    </Text>
                  </Box>
                  <Box flexShrink={0} columnGap="sm">
                    {r.report ? (
                      <Button
                        key={`details-${r.repo}`}
                        label={isOpen ? 'Hide' : 'Details'}
                        onPress={() => update($, expanded, () => (isOpen ? null : r.repo))}
                      />
                    ) : null}
                    {r.state !== 'running' ? (
                      <Button key={`dismiss-${r.repo}`} label="Dismiss" onPress={() => dismiss(r.repo)} />
                    ) : null}
                  </Box>
                </Box>
                {isOpen ? <Text dimColor>{r.report}</Text> : null}
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
