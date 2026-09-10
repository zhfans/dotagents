# CLAUDE.md

## No global changes without an explicit request

Never change global/user-level configuration or install anything globally on your own initiative or as a side effect of another task. Do it only when I explicitly ask for that specific change. This covers, but is not limited to:

- **Global config:** `~/.claude/` (settings and this file), `~/.gitconfig` / `git config --global`, shell startup files (`~/.zshrc`, `~/.zprofile`, `~/.bashrc`, `~/.profile`), `~/.config/`, macOS `defaults write`, persistently-set environment variables, and other tool dotfiles under `$HOME`.
- **Global installs:** `npm i -g`, `pip install` outside a virtualenv, `pipx` / `uv tool install`, `brew install`, `gem install`, `cargo install`, `go install`, and any system package manager (`apt`, `dnf`, …).

Keep changes project-local instead: virtualenvs, project-local dependencies, and in-repo config files. If a global change or install genuinely seems necessary, stop and tell me the exact command to run rather than running it yourself.

## Notes repo

I may keep a personal notes repo at `~/Repositories/notes` or `~/notes` — check in that order; if neither exists, this section does not apply.

When you work in it, follow its own `CLAUDE.md`.

Take notes proactively while working — don't wait to be asked. When a task turns up something that keeps its value afterward, write it there: non-obvious discoveries, the reasoning behind a decision, useful references, fixes for fiddly problems, anything I'd plausibly look up later. Keep it to durable, reusable knowledge, not a step-by-step log. Requests to "note that down" or to save findings while working elsewhere go here too.

Consult it too, at your discretion. When a task might already be covered there — a past investigation, the rationale for an earlier decision, a fix for something fiddly — check the notes before working it out from scratch. Use judgement about when that's worth doing; not every task needs it.
