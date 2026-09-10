---
name: install-claude
description: >-
  Install this repo's tracked user-level Claude Code config onto the current
  machine: merge claude/CLAUDE.md into ~/.claude/CLAUDE.md, and install the
  claude/hooks/ scripts plus the claude/settings.hooks.json block into ~/.claude/,
  adjusting machine-specific paths instead of copying them verbatim. Pass
  `capture` to fold this machine's portable CLAUDE.md edits back into the repo.
argument-hint: [capture]
disable-model-invocation: true
allowed-tools: Read, Bash(diff *), Bash(git diff *), Bash(git status *), Bash(command -v *), Bash(ls *)
---

The repo holds two payloads, both portable sources of truth:

- `${CLAUDE_PROJECT_DIR}/claude/CLAUDE.md` → `~/.claude/CLAUDE.md`, the user
  instructions Claude Code loads on this machine. Separate files, no symlink.
- `${CLAUDE_PROJECT_DIR}/claude/hooks/*.sh` + `${CLAUDE_PROJECT_DIR}/claude/settings.hooks.json`
  → `~/.claude/hooks/` and the `hooks` block of `~/.claude/settings.json`. A
  `UserPromptSubmit` hook that reprints a pointer to `CLAUDE.md` into each turn's
  context, since `CLAUDE.md` is loaded once and fades. Repo-owned: edited here,
  not on the machine.

`$ARGUMENTS` is empty (install — the default) or `capture` (the reverse).

## Default — repo → machine

### CLAUDE.md

- If `~/.claude/CLAUDE.md` is absent, the repo copy becomes the result.
- Otherwise show `diff ~/.claude/CLAUDE.md ${CLAUDE_PROJECT_DIR}/claude/CLAUDE.md`
  and merge rather than overwrite:
  - portable content in the repo copy but missing locally → add it
  - machine-specific content only in the live file → keep it
  - the two disagree on the same point → ask
- Adjust machine-specific values for this machine (see below).
- Show the merged result, then write `~/.claude/CLAUDE.md`.
- If the live file held portable edits missing from the repo copy, mention that `capture` brings them back.

### Hooks

- Create `~/.claude/hooks/` if absent. Copy every
  `${CLAUDE_PROJECT_DIR}/claude/hooks/*.sh` into it and `chmod +x` each. The repo
  is the source of truth for these — overwrite existing copies. If a script that
  used to be here is gone from the repo (e.g. a renamed hook), remove its stale
  copy from `~/.claude/hooks/` too.
- Merge the `hooks` block from `${CLAUDE_PROJECT_DIR}/claude/settings.hooks.json`
  into `~/.claude/settings.json`:
  - Create `~/.claude/settings.json` as `{}` if absent.
  - For each event in the fragment (currently just `UserPromptSubmit`), ensure
    its entry is present in that event's array. If an entry whose `command` ends
    in the same script filename already exists, replace it in place; otherwise
    append. Keep re-install idempotent — never stack duplicates. Drop any entry
    left behind by a renamed/removed hook script from this repo.
  - Leave every other key in `settings.json` untouched. The fragment's
    `_comment` key is documentation — do not copy it across.
  - Command paths use `$HOME/.claude/hooks/<script>.sh`. `$HOME` is an inherited
    env var and expands in hook commands; `~` does not. If this machine's harness
    is known not to expand `$HOME` there, substitute the literal absolute path.
  - Show the resulting `~/.claude/settings.json`, then write it.

### After

- Say a new session is needed to load the changes — `/context` shows the
  CLAUDE.md load; the hook is picked up at session start.

## capture — machine → repo

`capture` covers `CLAUDE.md` only. The hook scripts and `settings.hooks.json`
are repo-owned; change them in the repo and re-run the default install.

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
