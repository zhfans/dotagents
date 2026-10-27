# dotagents

Version-controlled copy of my user-level configuration for AI coding agents.

Today that's one agent — [Claude Code](https://code.claude.com) — and what it
loads from `~/.claude/` in every project: the user-level `CLAUDE.md`, two
hooks that keep its guidance from fading over a long session — a per-turn
reminder, and a per-turn check against the notes repo before the agent stops —
a hook that has the agent search the notes for context on a session's first
request, a subagent that independently reviews each commit the agent makes,
and a review of each PR the agent opens.
The layout leaves room for other agents beside it.

## Layout

```
claude/CLAUDE.md                        tracked copy of ~/.claude/CLAUDE.md
claude/hooks/claude-md-reminder.sh      UserPromptSubmit hook: per-turn CLAUDE.md reminder
claude/hooks/notes-checkpoint.sh        Stop hook: per-turn notes-repo check before finishing
claude/hooks/notes-lookup.sh            UserPromptSubmit hook: notes-repo lookup on a session's first prompt
claude/hooks/pr-review-nudge.sh         PostToolUse hook: PR-review reminder after gh pr create
claude/hooks/commit-review-nudge.sh     Pre/PostToolUse hook: no commit+push in one command; review reminder after git commit
claude/hooks/user-messages.sh           helper the commit reviewer runs: the user's messages from a transcript
claude/agents/commit-reviewer.md        subagent that reviews each staged change before a commit
claude/settings.hooks.json              the ~/.claude/settings.json "hooks" block, plus the
                                        allow rules the commit reviewer needs
claude/mods/commit-review-band/         Claude Code mod: commit-review verdicts in a band above the prompt
.claude-plugin/marketplace.json         makes this repo a plugin marketplace for the mods
.claude/skills/install-claude/SKILL.md  skill that reconciles repo ↔ machine
```

One directory per agent at the repo root: `claude/` holds what belongs under
`~/.claude/`. Another agent means another top-level directory (`codex/`,
`gemini/`, …), each paired with a skill that knows where its files deploy.

`claude/CLAUDE.md` lives in its own directory, not at the repo root, on purpose:
a `CLAUDE.md` at the root — or in a root `.claude/` — loads as *project*
instructions whenever Claude Code runs here, and this is payload, not guidance
for working on the repo. Tucked under `claude/`, it loads only if an agent
explicitly reads it.

## No symlink, no install script

The live file is a plain file, not a symlink, and there is no `install.sh`.
User-level config can legitimately differ between machines — absolute paths, tool
locations, OS-specific notes — so propagation goes through a skill that
reconciles the tracked and live copies each run instead of overwriting one with
the other.

## The CLAUDE.md reminder hook

`CLAUDE.md` is loaded once at session start and then relied on to be
remembered. Its guidance fades over a long session — the trigger here was a
"take notes proactively" instruction going unfollowed, and adding explicit
checkpoints to the text didn't fix it, because nothing re-surfaces them. Hooks
are the part of Claude Code that runs on every turn regardless of what the model
is holding onto.

`claude/hooks/claude-md-reminder.sh` runs on `UserPromptSubmit` — before the
agent reads each new message — and prints one line, which Claude Code injects
into that turn's context: *keep the guidance in the user-level `CLAUDE.md` in
mind as you work.* `UserPromptSubmit` is one of the few events where a hook's
plain stdout becomes model context, so the script is nothing but that text — no
JSON, no `jq`, no logic. It points at the whole file, not any one part; the
guidance itself stays in `CLAUDE.md`.

Trade-offs of this approach:

- **It's a nudge, not a gate.** The line is context, same category as
  `CLAUDE.md` — just refreshed every turn instead of once. The agent can read
  past it — and, confirmed in a real session (2026-09-22), does: it traced and
  explained this hook's own mechanics in detail without that ever triggering a
  check against the notes repo. See [the notes-repo checkpoint
  hook](#the-notes-repo-checkpoint-hook) below for the follow-up.
- **Every turn.** It fires on trivial turns too. Cheaper than a blocking hook
  (no extra round-trip), which is why it's kept despite the finding above — it
  still covers the whole file, not just note-taking.

## The notes-repo checkpoint hook

The reminder above is a nudge; the note-taking instruction specifically needed
a gate. `claude/hooks/notes-checkpoint.sh` runs on `Stop` — when the agent is
about to finish responding — and returns
`hookSpecificOutput.additionalContext` asking whether anything from the turn
belongs in the notes repo. Unlike `decision: "block"`, `additionalContext`
reads as non-error feedback: Claude Code labels it "Stop hook feedback" in the
transcript instead of a hook error, which fits a routine per-turn checkpoint
better than something styled as a failure.

The hook checks the `stop_hook_active` field on its stdin and exits 0
immediately when it's `true`, so a turn gets asked once, not looped — Claude
Code also hard-caps at 8 consecutive blocks regardless, as a second backstop.

Trade-offs:

- **Costs a round-trip every turn**, including ones with nothing to note —
  exactly what the reminder hook avoided by staying passive. Worth paying
  only because passive didn't work on its own.
- **Still just a question, not a verdict.** The hook can't tell whether a turn
  actually produced anything worth keeping; it can only force the agent to
  answer. A turn that silently decides "nothing to note" every time would
  satisfy the hook without fixing the underlying problem — this closes the
  "never even checked" failure mode, not a "checked carelessly" one.
- **Silent on "no."** The prompt tells the agent to stop without commentary
  when nothing qualifies, so a clean turn ends without a "nothing to note"
  filler line — only a "yes" produces visible output, the note itself. The
  round-trip above still happens either way; only its visibility changes.

## The notes-repo lookup hook

The checkpoint above covers writing notes; this covers reading them. The
user-level `CLAUDE.md` says to consult the notes when a task might already be
covered there, but that's at the agent's discretion, and the start of a
session is when the context would help most.

`claude/hooks/notes-lookup.sh` runs on `UserPromptSubmit` and acts on a
session's first prompt only. It returns `hookSpecificOutput.additionalContext`
telling the agent to search the notes repo for anything relevant to that
request before it starts, handing a broad search to a read-only subagent so
only the conclusions land in context. `SessionStart` can't do this: it fires
before the user has typed anything, so there's nothing yet to look up.

Trade-offs:

- **First prompt only.** A marker file per `session_id` in
  `${XDG_CACHE_HOME:-~/.cache}/claude-notes-lookup/` keeps later turns quiet.
  It's per-user rather than a shared `/tmp` path another user could create
  first. If the marker can't be written the hook stays silent, so a failed
  write can't repeat the lookup every turn. Markers older than 30 days are
  deleted, and a session resumed after that gets one
  more lookup. A request that changes topic mid-session gets none; the
  `CLAUDE.md` guidance still covers that.
- **The agent searches, not the script.** A keyword grep on the prompt would
  match its wording, not its meaning. The cost is a few reads, or a subagent,
  at the start of each session, including ones the notes don't cover. The
  prompt tells the agent to skip trivial requests and to say nothing when it
  finds nothing.
- **An instruction, not a gate.** Like the reminder hook, the agent can read
  past it.
- **Not an `agent` hook.** On `UserPromptSubmit` an agent hook returns only
  `ok`/`reason`, and `ok: false` blocks the prompt, so it has no clean way to
  hand found context to the main agent.
- **Notes path** is resolved the same way as in `CLAUDE.md`
  (`~/Repositories/notes`, then `~/notes`); with neither, the hook does
  nothing. Needs `jq`; without it, it does nothing.

## The commit reviewer

Each change gets an independent review before the agent commits it. The
"Review before every commit" section of `claude/CLAUDE.md` tells the agent to
stage the change, run the `commit-reviewer` subagent
(`claude/agents/commit-reviewer.md`) in the foreground, and commit only on its
`PASS`, showing the user its `Verdict:` and `Sources:` lines.

**When:** right before `git commit`. At that point the change is finished and
its boundary is the staged diff, and anything the review finds goes into the
same commit instead of a follow-up.

**Who:** not the agent that wrote the change. It already believes the change is
right, and if it misread the request, a brief it writes would repeat the
misreading. So the brief carries only the repo path and the planned commit
message, and the reviewer gathers the rest from sources the author didn't
write:

| Needs | Source |
|---|---|
| What the user asked for | the user's own messages (typed mid-turn too) and `AskUserQuestion` answers, each after the agent's last few messages before it, printed by `~/.claude/hooks/user-messages.sh $CLAUDE_CODE_SESSION_ID` from the session's transcript |
| What changed | `git diff --cached` |
| What the author says it does | the planned commit message, treated as a claim to check |

If it can't get the user's messages or the diff, the reviewer says so and
passes: a blind review only guesses. The fragment's `permissions.allow` lists
its two commands so an auto-mode session doesn't refuse them, as it did when
the reviewer ran its own `jq` on the transcript. The `jq` filter lives in a
script so that one narrow rule can allow it.

**Why a subagent, not a hook:** until 2026-10-26 this was a `PreToolUse` agent
hook on `git commit`. It worked, and the agent couldn't skip it, but a passed
review left no trace: no transcript entry, no message. A pass couldn't be told
apart from a blind review or a hook that never fired. A subagent's call and
verdict show in the session. The cost is that the review now relies on the
agent following `CLAUDE.md`.

Trade-offs:

- **Instruction, not enforcement.** The agent can forget or skip the review,
  and nothing stops the commit. A skipped review is at least visible: the reply
  has no `Verdict:` line.
- **The author writes the brief.** The instruction limits it to the repo path
  and commit message, and the reviewer's own prompt tells it to ignore anything
  else the brief says about the change.
- **Slower commits, and a paid review on each one.**
- **Commits made by hand skip it.** Covering those needs a git `pre-commit` hook
  in each repo.
- **Session id from the environment.** The reviewer finds the transcript
  through `$CLAUDE_CODE_SESSION_ID`, set in Bash by Claude Code (seen in
  2.1.308). Without it, `user-messages.sh` finds no transcript and the review
  passes blind, saying so in its `Sources:` line.
- **The reviewer's own instructions can leak in.** In a live test of the old
  hook it flagged the commit's `Co-Authored-By` trailer because its own
  attribution reminder named a different model. The prompt says its own
  instructions are not the spec.
- **The agent's messages are context, not spec.** The reviewer sees them so a
  reply like "sure, do that" can be read against what it approved. Only the
  user's words say what the commit should be. Harness-injected strings
  (subagent hand-backs, task notifications) are left out by their transcript
  `origin`, so they don't pass as the user's.
- **Nudged after the commit, before the push.** CLAUDE.md fades over a long
  session, so `claude/hooks/commit-review-nudge.sh` runs on `PostToolUse` with
  `"if": "Bash(git *)"` and, after each successful `git commit`, reminds the
  agent to run the reviewer if it skipped it and to fix findings with
  `--amend` before pushing. It can't come earlier: a `PreToolUse` hook's
  `additionalContext` reaches the agent next to the tool result, after the
  command ran. A late review is still harmless while nothing is pushed, so the
  same script also runs on `PreToolUse` and denies a command that both commits
  and pushes; CLAUDE.md says to push separately too. The reminder fires after
  reviewed commits too, and a chained commit and push costs one refused attempt.
  The script matches `git commit` and `git push` after removing heredoc bodies
  and quoted strings, so a commit message that mentions `git push` isn't
  refused, and it stays quiet after a dry run or a commit with nothing to
  commit. It suggests `git show HEAD` as the diff, which works for a repo's
  first commit too.
- **Verdicts can get lost in a long reply.** The `commit-review-band` mod
  (`claude/mods/`) shows each review in a band above the prompt, drawn by
  Claude Code rather than written by the agent: ⏳ while it runs, then ✅ PASS
  with the user's words it checked against, ⛔ BLOCK with its findings, or ⚠️
  for a blind review. It reads the brief when the reviewer starts
  (`agent.spawn`) and its report from the reviewer's own `SubagentHandback`
  call, which a `tool.call` hook sees inside the reviewer's loop with its
  `agentId`; that covers foreground and background reviews however the report
  is delivered. `turn.complete` (for a reviewer ending in plain text), the
  hand-back prompt, the Agent tool's result and `classic.SubagentStop` are
  read as well; another plugin may answer `SubagentStop` first, and a
  hand-back that arrives mid-turn reaches no `prompt.submit` hook. A git
  worktree's row is named after its main repo. It draws
  above whatever other plugins' bands draw, never in place of them. It also
  watches `git commit` and shows ⚠️ for a commit with no passing review in that
  repo since its last commit, a check the hooks can't make. Like the nudge, it
  ignores `git commit` inside quoted text or heredoc bodies, dry runs, and
  commits with nothing to commit. A
  committed PASS row clears at the next prompt; BLOCK and ⚠️ rows stay until
  dismissed or replaced. With no rows it shows a dim "no reviews yet" line,
  so the band shows the mod is loaded. Mods are an early-access Claude Code
  API.
- **Needs `jq` on the machine**, which `install` checks for.
- **Allow rules are global.** `Bash(git diff *)` and the helper are allowed
  for every session, not only the reviewer. Both only read.

## The PR review

After the agent opens a PR, the "Review after opening a PR" section of
`claude/CLAUDE.md` has it run the built-in `/code-review <PR number>` and list
the findings. It then asks the user which to do: post them on the PR as one
review with inline comments, or fix them locally, commit (through the commit
reviewer) and push. Nothing is posted or changed before the answer.

`claude/hooks/pr-review-nudge.sh` runs on `PostToolUse` with
`"if": "Bash(gh *)"` and returns fixed `additionalContext` pointing the agent
at that section, so the step isn't forgotten late in a long session.

**Why `Bash(gh *)`, not `Bash(gh pr create*)`:** an `if` pattern that names
arguments, not just the command, runs the hook anyway on any command containing
`$()`, backticks or `$VAR` ([hooks
reference](https://code.claude.com/docs/en/hooks), "How `if` patterns match
Bash commands"), because those expand only at run time. Agents write such
commands all the time, and right after install the `gh pr create*` version
fired on most Bash calls. A pattern naming only the command can be checked from
the text, so `gh *` filters reliably. It also passes `gh pr view`, `gh api` and
the rest, so the script narrows it: it reads stdin with `jq` and nudges only
when the command mentions `pr create` and the output has a PR URL
(`…/pull/<number>`), which `gh pr create` prints on success.

**Why `/code-review`, not a custom reviewer:** it already runs as a forked
subagent (its own context window; only the result comes back), so the main
session's context stays small. A fork inherits the conversation, so unlike the
commit reviewer it isn't independent of the author's reasoning. Each commit has
already had the independent review, so the PR review is there to look at the
whole change. Its built-in `--comment` isn't used: the agent posts the
findings itself, so the user can choose after seeing them instead of before.

Trade-offs:

- **Instruction plus nudge, not enforcement.** The agent can still skip it.
- **PRs opened by hand or through the GitHub API** get no nudge.
- **The script's check is loose.** A `gh` command that mentions `pr create`
  anywhere (say, in a commit message chained with `gh pr view`) and prints a PR
  URL gets the nudge without opening a PR. Rare enough for a reminder.
- **`if` still isn't exact.** When Claude Code can't tell which commands an
  input runs, it runs the hook regardless; the script's check covers that too.
- **Needs `jq` for that check.** Without it the script exits silently, so no
  nudge at all.
- **A paid review per PR**, on top of the per-commit reviews.
- **Inline comments through `gh api`** need each finding on a changed line;
  the rest goes in the review body.

## Use it

From a Claude Code session started in this repo (trust the folder when
prompted):

| Command | Direction | Effect |
|---|---|---|
| `/install-claude` | repo → machine | Merge the repo copy into `~/.claude/CLAUDE.md`, adjusting machine-specific paths (creates it if absent); copy `claude/agents/*.md` into `~/.claude/agents/` and `claude/hooks/*.sh` into `~/.claude/hooks/`, remove the retired commit-review agent hook, merge the `hooks` block and the `permissions.allow` rules into `~/.claude/settings.json`, and install the mods in `claude/mods/` as plugins from this repo's marketplace. |
| `/install-claude capture` | machine → repo | Fold this machine's portable `CLAUDE.md` edits into `claude/CLAUDE.md`, generalising machine-specific values. Leaves it uncommitted. `CLAUDE.md` only — hooks and subagents are repo-owned. |

Bare `/install-claude` installs; `capture` is the explicit reverse. Full
procedure in [`SKILL.md`](.claude/skills/install-claude/SKILL.md). The skill's
`allowed-tools` grant is read-only inspection (`Read`, `diff`, `git diff`, `git
status`, `ls`); the writes themselves prompt for approval.

## Known machine-specific content

- **Notes-repo path** — the `CLAUDE.md` notes section checks
  `~/Repositories/notes` then `~/notes`, so a vault at either resolves without
  edits. A vault kept anywhere else needs that section changed for the machine;
  `install` asks when neither path is present. `notes-lookup.sh` checks the
  same two paths, so a vault elsewhere needs that script changed too.
- **`$HOME` in the hook command** — `claude/settings.hooks.json` points at
  `$HOME/.claude/hooks/…` because a machine-specific absolute path can't be
  committed. `$HOME` expands only if the hook runner runs `command` through a
  shell (`~` never expands); where it execs directly, `install` rewrites the
  path to an absolute one for that machine.

## Not tracked yet

- **Other agents** — user-level config for anything besides Claude Code would
  get its own top-level directory and reconcile skill.
