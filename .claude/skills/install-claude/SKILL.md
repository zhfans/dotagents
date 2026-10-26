---
name: install-claude
description: >-
  Install this repo's tracked user-level Claude Code config onto the current
  machine: merge claude/CLAUDE.md into ~/.claude/CLAUDE.md, and install this
  repo's hook scripts, hooks and allow rules from settings.hooks.json under ~/.claude/, adjusting
  machine-specific paths instead of copying them verbatim. Pass `capture` to fold
  this machine's portable CLAUDE.md edits back into the repo.
argument-hint: [capture]
disable-model-invocation: true
allowed-tools: Read, Bash(diff *), Bash(git diff *), Bash(git status *), Bash(ls *)
---

The repo holds two payloads, both portable sources of truth:

- `${CLAUDE_PROJECT_DIR}/claude/CLAUDE.md` → `~/.claude/CLAUDE.md`, the user
  instructions Claude Code loads on this machine. Separate files, no symlink.
- `${CLAUDE_PROJECT_DIR}/claude/hooks/*.sh` + `${CLAUDE_PROJECT_DIR}/claude/settings.hooks.json`
  → `~/.claude/hooks/`, and the `hooks` block and `permissions.allow` list of
  `~/.claude/settings.json`. A
  `UserPromptSubmit` hook that reprints a pointer to `CLAUDE.md` into each turn's
  context, since `CLAUDE.md` is loaded once and fades, a `Stop` hook that
  forces one check against the notes repo before each turn ends, a
  `UserPromptSubmit` hook that has the agent search the notes repo for context
  on a session's first prompt, and a
  `PreToolUse` agent hook that has an independent reviewer check each
  `git commit` the agent runs, with allow rules for the two commands that
  reviewer runs. Repo-owned: edited here, not on the machine.

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
  `${CLAUDE_PROJECT_DIR}/claude/hooks/*.sh` into it and `chmod +x` each,
  overwriting existing copies — the repo is the source of truth for the scripts
  it ships.
- Merge the `hooks` block from `${CLAUDE_PROJECT_DIR}/claude/settings.hooks.json`
  into `~/.claude/settings.json`:
  - Create `~/.claude/settings.json` as `{}` if absent.
  - For each event the fragment defines (today `UserPromptSubmit`, `PreToolUse`
    and `Stop`), reconcile that event's array against the fragment, matching
    entries by their handler's identity: a `command` hook by its script's
    basename, and an `agent` or `prompt` hook, which has no script, by its
    `statusMessage` (today only `"Reviewing the commit"`). Replace a matching
    entry in place, append if absent. Never stack duplicates.
  - Prune only inside events the fragment defines, and only entries this skill
    can attribute to itself: an entry whose `command` points at
    `~/.claude/hooks/<name>.sh` for a `<name>` this repo no longer ships in
    `claude/hooks/` is a leftover from an earlier install — drop that entry and
    delete that one script. Touch nothing else: other events, entries pointing
    outside `~/.claude/hooks/`, and any script with no matching managed entry are
    left alone. An `agent` or `prompt` hook can't be traced back to this repo
    once its `statusMessage` is gone from the fragment, so never prune one: if
    one looks like an earlier version of this repo's, point it out and ask. If
    unsure whether a leftover is this repo's, keep it and say so.
  - The commit reviewer runs `jq` (through `user-messages.sh`) and `git`. If
    `jq` isn't on the PATH, say so and give the install command for this
    machine; don't install it.
  - Command paths use `$HOME/.claude/hooks/<name>.sh` — portable across machines,
    and expanded only when the hook runner runs `command` through a shell (`~` is
    never expanded). Where the runner execs directly and `$HOME` stays literal,
    substitute the absolute path.
- Merge the fragment's `permissions.allow` list into the same file: add each
  rule that isn't already there, as written. Keep the literal `~` in them: Bash
  rules match the command text as typed, and the reviewer's prompt tells it to
  type `~`. Never remove a rule, except one naming `~/.claude/hooks/<name>.sh`
  for a `<name>` this repo no longer ships, which is a leftover like the hook
  entries above. Leave the rest of `permissions` (`deny`, `ask`,
  `defaultMode`, …) alone.
- Leave every other key in `settings.json` untouched. The fragment's `_comment`
  key is documentation — do not copy it across.
- Show the resulting `~/.claude/settings.json`, then write it.

### After

- Say a new session is the sure way to load the changes — `/context` shows the
  CLAUDE.md load. Hook changes have also been seen to apply to a session that
  was already running, so the commit reviewer may start on this session's next
  `git commit`.

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
