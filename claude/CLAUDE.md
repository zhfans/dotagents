# CLAUDE.md

## No global changes without an explicit request

Never change global/user-level configuration or install anything globally on your own initiative or as a side effect of another task. Do it only when I explicitly ask for that specific change. This covers, but is not limited to:

- **Global config:** `~/.claude/` (settings and this file), `~/.gitconfig` / `git config --global`, shell startup files (`~/.zshrc`, `~/.zprofile`, `~/.bashrc`, `~/.profile`), `~/.config/`, macOS `defaults write`, persistently-set environment variables, and other tool dotfiles under `$HOME`.
- **Global installs:** `npm i -g`, `pip install` outside a virtualenv, `pipx` / `uv tool install`, `brew install`, `gem install`, `cargo install`, `go install`, and any system package manager (`apt`, `dnf`, …).

Keep changes project-local instead: virtualenvs, project-local dependencies, and in-repo config files. If a global change or install genuinely seems necessary, stop and tell me the exact command to run rather than running it yourself.

## Notes repo

I may keep a personal notes repo at `~/Repositories/notes` or `~/notes` — check in that order; if neither exists, this section does not apply.

Take notes proactively while working — don't wait to be asked. When a task turns up something that keeps its value afterward, write it there: non-obvious discoveries, the reasoning behind a decision, useful references, fixes for fiddly problems, anything I'd plausibly look up later. Keep it to durable, reusable knowledge, not a step-by-step log. Requests to "note that down" or to save findings while working elsewhere go here too.

Don't rely on an ambient sense of this while working — it loses to whatever's immediately in front of you over a long session. Instead, check at concrete checkpoints: after a commit lands, after a PR is opened or merged, when a debugging or investigation thread resolves, after untangling a gnarly environment/tooling/dependency issue, after reading through someone else's code, docs, or notes to understand why something is the way it is, when an assumption you were operating on turns out to be wrong, after finishing a comparison or audit against another codebase, when a task's approach pivots partway through, before ending a longer session, etc. At each one, pause and ask whether anything from it belongs here.

Consult it just as proactively as you write to it. Before spending real effort investigating something or re-deriving why a piece of code is the way it is, check whether it's already written down there. Treat any in-code comment or reference that names a note (e.g. "see X notes") as a direct pointer to go read right then, not a rhetorical aside to register and move past — don't wait for a nudge to actually go look it up.
