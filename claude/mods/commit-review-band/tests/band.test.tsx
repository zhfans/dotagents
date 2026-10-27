import { expect, test } from 'claude-code/testing'

import { commitRepo, parseBrief, parseHandback, parseReport } from '../hooks/register'

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
    repo: 'dotagents',
    subject: 'Add a nudge',
  })
  expect(parseBrief('Repo: /x/notes\nPlanned commit message:\n"Note it"').subject).toBe('Note it')
  expect(commitRepo('cd /a/notes && git commit -q -F - <<EOF')).toBe('/a/notes')
  expect(commitRepo('git -C /b/dotagents commit -m x')).toBe('/b/dotagents')
  expect(commitRepo('git commit -m x')).toBeUndefined()
  expect(commitRepo('git -c user.name=x commit -m y')).toBeUndefined()
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
