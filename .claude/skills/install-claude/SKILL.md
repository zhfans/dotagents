---
name: install-claude
description: >-
  Install this repo's tracked user-level CLAUDE.md onto the current machine: merge
  claude/CLAUDE.md into ~/.claude/CLAUDE.md, adjusting machine-specific paths
  instead of copying them verbatim. Pass `capture` to go the other way and fold
  this machine's portable edits back into the repo.
argument-hint: [capture]
disable-model-invocation: true
allowed-tools: Read, Bash(diff *), Bash(git diff *), Bash(git status *)
---

The repo copy at `${CLAUDE_PROJECT_DIR}/claude/CLAUDE.md` is the portable
source of truth. The live file at `~/.claude/CLAUDE.md` is what Claude Code loads
as user instructions on this machine. They are separate files — no symlink.

`$ARGUMENTS` is empty (install — the default) or `capture` (the reverse).

## Default — repo → machine

- If `~/.claude/CLAUDE.md` is absent, the repo copy becomes the result.
- Otherwise show `diff ~/.claude/CLAUDE.md ${CLAUDE_PROJECT_DIR}/claude/CLAUDE.md`
  and merge rather than overwrite:
  - portable content in the repo copy but missing locally → add it
  - machine-specific content only in the live file → keep it
  - the two disagree on the same point → ask
- Adjust machine-specific values for this machine (see below).
- Show the merged result, then write `~/.claude/CLAUDE.md`.
- Say that a new session (or `/context`) is needed to load the change.
- If the live file held portable edits missing from the repo copy, mention that `capture` brings them back.

## capture — machine → repo

- Show `diff ${CLAUDE_PROJECT_DIR}/claude/CLAUDE.md ~/.claude/CLAUDE.md`.
- For content only in the live file:
  - portable (a preference, convention, workflow rule, tool choice) → add to the repo copy
  - machine-specific → generalise it (see below) or omit it, and list what was omitted
- Write the repo copy, show its `git diff`, and stop. Committing is the user's decision.

## Portable vs machine-specific

- Absolute path under the user's home directory → rewrite as `~/…`; confirm the
  target exists on this machine, ask if it doesn't.
- Path outside home (`/opt`, `/usr/local`, …), hostname, username, OS-conditional
  note, hardware detail → machine-specific: belongs in the live file, not the repo copy.
- General instructions, conventions, preferences → portable.
- Unsure → ask.

Nothing in the repo copy is machine-specific today: the notes-repo section adapts
by checking `~/Repositories/notes` and `~/notes` at runtime. A vault kept anywhere
else is the one thing that would need a per-machine edit.
