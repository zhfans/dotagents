import { expect, test } from 'claude-code/testing'

import { commitRepo, isCommit, parseBrief, parseHandback, parseReport } from '../hooks/register'

const BAND = {
  plugin: 'commit-review-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

const PASS = `Verdict: PASS
Sources: I checked against the user's request "Build the fix: add answers". I ran \`git diff --cached\` in /r/dotagents.
Findings: none.`

const BLOCK = `Verdict: BLOCK
Sources: user asked "stop crashing on None"; ran git diff --cached
Findings:
- calc.py:3 subtracts instead of adding.
- README.md:1 typo.
Not checked: tests.`

const BLIND = `Verdict: PASS
Sources: couldn't get the user's messages (no readable transcript); ran git diff --cached
Findings: none`

test('parses the reviewer report', () => {
  expect(parseReport(PASS)).toEqual({
    state: 'pass',
    spec: 'Build the fix: add answers',
    diff: 'git diff --cached',
    findings: [],
  })
  const block = parseReport(BLOCK)
  expect(block.state).toBe('block')
  expect(block.findings).toEqual(['calc.py:3 subtracts instead of adding.', 'README.md:1 typo.'])
  expect(parseReport(BLIND).state).toBe('blind')
  expect(parseReport('no verdict here').state).toBe('blind')
})

test('parses the brief and the commit repo', () => {
  expect(parseBrief('Repo: /home/u/Repositories/dotagents\nPlanned commit message: "Add a nudge\n\nbody"')).toEqual({
    repo: '/home/u/Repositories/dotagents',
    subject: 'Add a nudge',
  })
  expect(parseBrief('Repo: /x/notes\nPlanned commit message:\n"Note it"').subject).toBe('Note it')
  expect(commitRepo('cd /a/notes && git commit -q -F - <<EOF')).toBe('/a/notes')
  expect(commitRepo('git -C /b/dotagents commit -m x')).toBe('/b/dotagents')
  expect(commitRepo('git commit -m x')).toBeUndefined()
  expect(commitRepo('git -c user.name=x commit -m y')).toBeUndefined()
  expect(commitRepo('cd /a/notes; git commit -m x')).toBe('/a/notes')
  expect(commitRepo('cd /a/notes\ngit commit -m x')).toBe('/a/notes')
  expect(isCommit('git commit -m x', '[main 1a2b3c4] x')).toBe(true)
  expect(isCommit('git tag -a v1 -m "after git commit"', '')).toBe(false)
  expect(isCommit('git commit -F - <<EOF\nmention git commit\nEOF', '')).toBe(true)
  expect(isCommit('echo done <<EOF\ngit commit\nEOF', '')).toBe(false)
  expect(isCommit('git commit --dry-run', '')).toBe(false)
  expect(isCommit('git commit -m x || true', 'nothing to commit, working tree clean')).toBe(false)
})

test('a review shows in the band, then the commit', async ($, on) => {
  on('agent.spawn', () => ({ agentId: 'a1', model: 'm' }))
  on('session.cwd', () => ({ value: '/r/dotagents' }))
  on('tool.call', () => ({ result: { stdout: '[main 1a2b3c4] Add a nudge', stderr: '' } }))
  on('classic.SubagentStop', () => ({}))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // Before any review, an idle row shows the mod is loaded.
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await idle.find({ type: 'Text', text: /no reviews yet/ })).toBeTruthy()
  await idle.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.agent.spawn({
      subagentType: 'commit-reviewer',
      prompt: 'Repo: /r/dotagents\nPlanned commit message: "Add a nudge"',
    })
    let ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /reviewing/ }))?.text).toContain('dotagents')
    await ui.unmount()

    await $.classic.SubagentStop({
      agent_id: 'a1',
      agent_type: 'commit-reviewer',
      agent_transcript_path: '/t',
      stop_hook_active: false,
      last_assistant_message: PASS,
    })
    ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /PASS/ }))?.text).toContain('checked against "Build the fix: add answers"')
    await ui.unmount()

    await $.tool.call({ tool: 'Bash', command: 'git commit -m "Add a nudge"' })
    ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /PASS/ }))?.text).toContain('committed 1a2b3c4')
    await ui.unmount()

    // A second commit with no new review is flagged.
    await $.tool.call({ tool: 'Bash', command: 'git commit -m "Sneak"' })
    ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /no passing review/ }))?.text).toContain('dotagents')
    await ui.unmount()

    await $.prompt.submit({ text: 'next' })
  }
})

const HANDBACK = `Another Claude session sent a message:
<agent-message from="a9">
[Subagent hand-back] The text below is the final report. The report follows:
  Verdict: BLOCK
  Sources: user asked "fix it"; ran git diff --cached
  Findings:
  - a.ts:1 wrong.
</agent-message>`

test('parses a hand-back delivery', () => {
  const handback = parseHandback(HANDBACK)
  expect(handback?.agentId).toBe('a9')
  expect(handback?.report.startsWith('Verdict: BLOCK')).toBe(true)
  expect(parseReport(handback?.report ?? '').findings).toEqual(['a.ts:1 wrong.'])
  expect(parseHandback('plain prompt')).toBeUndefined()
})

test('a background review ends through its hand-back, and the band beneath still draws', async ($, on) => {
  on('agent.spawn', () => ({ agentId: 'a9', model: 'm' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })

  await $.agent.spawn({ subagentType: 'commit-reviewer', prompt: 'Repo: /r/notes\nPlanned commit message: "Fix"' })
  await $.prompt.submit({ origin: { kind: 'peer' }, text: HANDBACK })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /BLOCK/ }))?.text).toContain('a.ts:1 wrong.')
  expect((await ui.find({ type: 'Text', text: /other band/ }))?.text).toBe('other band')
  await ui.unmount()
})

test('a foreground review ends through the Agent result; "Repo: ." is the session repo', async ($, on) => {
  on('agent.spawn', () => ({ agentId: 'f1', model: 'm' }))
  on('session.cwd', () => ({ value: '/r/dotagents' }))
  on('tool.call', () => ({ result: { agentId: 'f1', content: [{ type: 'text', text: PASS }] } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.agent.spawn({ subagentType: 'commit-reviewer', prompt: 'Repo: .\nPlanned commit message: "Fix"' })
  await $.tool.call({ tool: 'Agent', subagent_type: 'commit-reviewer', description: 'review', prompt: 'Repo: .' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /PASS/ }))?.text).toContain('dotagents')
  await ui.unmount()
})

test("a review ends with the reviewer's own turn; a worktree is named after its main repo", async ($, on) => {
  on('agent.spawn', () => ({ agentId: 't1', model: 'm' }))
  on('fs.read', (_, e) =>
    e.path === '/tmp/wt16/.git' ? { value: 'gitdir: /r/dotagents/.git/worktrees/wt16\n' } : { deny: 'no such file' },
  )
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.agent.spawn({ subagentType: 'commit-reviewer', prompt: 'Repo: /tmp/wt16\nPlanned commit message: "Fix"' })
  await $.turn.complete({ answer: PASS, durationMs: 1, isAborted: false, turnId: 'x', agentId: 't1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const row = await ui.find({ type: 'Text', text: /PASS/ })
  expect(row?.text).toContain('dotagents')
  expect(row?.text).not.toContain('wt16')
  await ui.unmount()
})

test("a review ends with the reviewer's SubagentHandback call", async ($, on) => {
  on('agent.spawn', () => ({ agentId: 'h1', model: 'm' }))
  on('tool.call', () => ({ result: {} }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.agent.spawn({ subagentType: 'commit-reviewer', prompt: 'Repo: /r/notes\nPlanned commit message: "Fix"' })
  await $.tool.call({ tool: 'SubagentHandback', message: BLOCK, agentId: 'h1' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /BLOCK/ }))?.text).toContain('notes')
  await ui.unmount()
})
