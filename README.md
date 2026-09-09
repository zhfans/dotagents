# dotagents

Version-controlled copy of my user-level configuration for AI coding agents.

Today that's one agent — [Claude Code](https://code.claude.com) — and one file:
the user-level `CLAUDE.md` it loads in every project, from `~/.claude/CLAUDE.md`.
The layout leaves room for other agents' user-level config beside it.

## Layout

```
home/.claude/CLAUDE.md                  tracked copy of ~/.claude/CLAUDE.md
.claude/skills/install-claude/SKILL.md  skill that reconciles the two copies
```

`home/` mirrors `$HOME`: whatever an agent keeps under the home directory is
tracked at the same path below `home/`, so the repo path matches the deploy
path. Another agent means another subtree here (`home/.codex/`, `home/.gemini/`,
…) — no restructuring.

`home/.claude/CLAUDE.md` sits a level down, not at the repo root, on purpose: a
`CLAUDE.md` at the root — or in a root `.claude/` — loads as *project*
instructions whenever Claude Code runs here, and this is payload, not guidance
for working on the repo. Nested, it loads only if an agent explicitly reads it.

## No symlink, no install script

The live file is a plain file, not a symlink, and there is no `install.sh`.
User-level config can legitimately differ between machines — absolute paths, tool
locations, OS-specific notes — so propagation goes through a skill that
reconciles the tracked and live copies each run instead of overwriting one with
the other.

## Use it

From a Claude Code session started in this repo (trust the folder when
prompted):

| Command | Direction | Effect |
|---|---|---|
| `/install-claude` | repo → machine | Merge the repo copy into `~/.claude/CLAUDE.md`, adjusting machine-specific paths. Creates the file if absent. |
| `/install-claude capture` | machine → repo | Fold this machine's portable edits into `home/.claude/CLAUDE.md`, generalising machine-specific values. Leaves it uncommitted. |

Bare `/install-claude` installs; `capture` is the explicit reverse. Full
procedure in [`SKILL.md`](.claude/skills/install-claude/SKILL.md). The skill's
`allowed-tools` grant is read-only (`diff`, `git status`); the writes themselves
prompt for approval.

## Known machine-specific content

- **Notes-vault path** — kept as `~/Repositories/notes` so it resolves anywhere
  that layout holds. A machine with the vault elsewhere needs that line changed;
  `install` asks when the path is missing.

## Not tracked yet

- **Other agents** — user-level config for anything besides Claude Code would
  live under `home/`, each with its own reconcile skill.
- **More of Claude Code** — `settings.json`, `commands/`, `agents/`, further
  `skills/`, hooks. Keep secrets and per-machine values in a gitignored
  `settings.local.json` and let Claude Code merge it at runtime.
