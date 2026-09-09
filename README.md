# dotagents

Version-controlled copy of my user-level configuration for AI coding agents.

Today that's one agent — [Claude Code](https://code.claude.com) — and one file:
the user-level `CLAUDE.md` it loads in every project, from `~/.claude/CLAUDE.md`.
The layout leaves room for other agents' user-level config beside it.

## Layout

```
claude/CLAUDE.md                        tracked copy of ~/.claude/CLAUDE.md
.claude/skills/install-claude/SKILL.md  skill that reconciles the two copies
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

## Use it

From a Claude Code session started in this repo (trust the folder when
prompted):

| Command | Direction | Effect |
|---|---|---|
| `/install-claude` | repo → machine | Merge the repo copy into `~/.claude/CLAUDE.md`, adjusting machine-specific paths. Creates the file if absent. |
| `/install-claude capture` | machine → repo | Fold this machine's portable edits into `claude/CLAUDE.md`, generalising machine-specific values. Leaves it uncommitted. |

Bare `/install-claude` installs; `capture` is the explicit reverse. Full
procedure in [`SKILL.md`](.claude/skills/install-claude/SKILL.md). The skill's
`allowed-tools` grant is read-only (`diff`, `git status`); the writes themselves
prompt for approval.

## Known machine-specific content

- **Notes-repo path** — the notes section checks `~/Repositories/notes` and
  `~/notes`, so a vault at either resolves without edits. A vault kept anywhere
  else needs that section changed for the machine; `install` asks when neither
  path is present.

## Not tracked yet

- **Other agents** — user-level config for anything besides Claude Code would
  get its own top-level directory and reconcile skill.
- **More of Claude Code** — `settings.json`, `commands/`, `agents/`, further
  `skills/`, hooks. Keep secrets and per-machine values in a gitignored
  `settings.local.json` and let Claude Code merge it at runtime.
