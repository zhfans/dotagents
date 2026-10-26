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

## Review before every commit

Before each `git commit` you run, in any repo, have the `commit-reviewer` subagent review the staged change, and wait for its verdict before committing.

1. Stage exactly what the commit will contain.
2. Start `commit-reviewer` in the foreground. Its brief is only: the repo path, the commit message you plan to use, and the diff command if it isn't `git diff --cached` (for `--amend`, `git diff --cached HEAD~1`; for `commit -a`, `git diff HEAD`). Don't describe the change, the request or your reasoning: the reviewer reads the user's messages and the diff itself, so a misreading of yours can't steer it.
3. On `BLOCK`, fix the findings, restage, and run a fresh review. Don't commit over a block. If you think a finding is wrong, tell me and let me decide.
4. On `PASS`, commit, and show me the reviewer's `Verdict:` and `Sources:` lines in your reply.

Skip it only when I say to for that commit.

## Review after opening a PR

Right after you open a pull request (`gh pr create`), review it before moving on:

1. Run `/code-review <PR number>` with no `--comment` or `--fix`, and wait for it.
2. If it finds nothing, say so in one line.
3. Otherwise list the findings, then ask me with `AskUserQuestion` which of these I want:
   - **Post them on the PR:** one PR review with event `COMMENT`, through `gh api repos/<owner>/<repo>/pulls/<n>/reviews`, with an inline comment at each finding's file and line. Put findings that aren't on a changed line in the review body. Change nothing locally.
   - **Fix them locally:** fix them, commit (with the commit review above), and push to the PR branch.

Don't post or fix anything before I answer. Skip the review only when I say to for that PR.
