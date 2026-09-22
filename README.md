# dotagents

Version-controlled copy of my user-level configuration for AI coding agents.

Today that's one agent — [Claude Code](https://code.claude.com) — and what it
loads from `~/.claude/` in every project: the user-level `CLAUDE.md`, plus two
hooks that keep its guidance from fading over a long session — a per-turn
reminder, and a per-turn check against the notes repo before the agent stops.
The layout leaves room for other agents beside it.

## Layout

```
claude/CLAUDE.md                        tracked copy of ~/.claude/CLAUDE.md
claude/hooks/claude-md-reminder.sh      UserPromptSubmit hook: per-turn CLAUDE.md reminder
claude/hooks/notes-checkpoint.sh        Stop hook: per-turn notes-repo check before finishing
claude/settings.hooks.json              the ~/.claude/settings.json "hooks" block
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

## Use it

From a Claude Code session started in this repo (trust the folder when
prompted):

| Command | Direction | Effect |
|---|---|---|
| `/install-claude` | repo → machine | Merge the repo copy into `~/.claude/CLAUDE.md`, adjusting machine-specific paths (creates it if absent); copy `claude/hooks/*.sh` into `~/.claude/hooks/` and merge the `hooks` block into `~/.claude/settings.json`. |
| `/install-claude capture` | machine → repo | Fold this machine's portable `CLAUDE.md` edits into `claude/CLAUDE.md`, generalising machine-specific values. Leaves it uncommitted. `CLAUDE.md` only — hooks are repo-owned. |

Bare `/install-claude` installs; `capture` is the explicit reverse. Full
procedure in [`SKILL.md`](.claude/skills/install-claude/SKILL.md). The skill's
`allowed-tools` grant is read-only inspection (`Read`, `diff`, `git diff`, `git
status`, `ls`); the writes themselves prompt for approval.

## Known machine-specific content

- **Notes-repo path** — the `CLAUDE.md` notes section checks
  `~/Repositories/notes` then `~/notes`, so a vault at either resolves without
  edits. A vault kept anywhere else needs that section changed for the machine;
  `install` asks when neither path is present. (The hook doesn't touch the vault,
  so it needs no path.)
- **`$HOME` in the hook command** — `claude/settings.hooks.json` points at
  `$HOME/.claude/hooks/…` because a machine-specific absolute path can't be
  committed. `$HOME` expands only if the hook runner runs `command` through a
  shell (`~` never expands); where it execs directly, `install` rewrites the
  path to an absolute one for that machine.

## Not tracked yet

- **Other agents** — user-level config for anything besides Claude Code would
  get its own top-level directory and reconcile skill.
