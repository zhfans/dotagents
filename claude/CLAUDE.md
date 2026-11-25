# CLAUDE.md

## No global changes without an explicit request

Never change global/user-level configuration or install anything globally on your own initiative or as a side effect of another task. Do it only when I explicitly ask for that specific change. This covers, but is not limited to:

- **Global config:** `~/.claude/` (settings and this file), `~/.gitconfig` / `git config --global`, shell startup files (`~/.zshrc`, `~/.zprofile`, `~/.bashrc`, `~/.profile`), `~/.config/`, macOS `defaults write`, persistently-set environment variables, and other tool dotfiles under `$HOME`.
- **Global installs:** `npm i -g`, `pip install` outside a virtualenv, `pipx` / `uv tool install`, `brew install`, `gem install`, `cargo install`, `go install`, and any system package manager (`apt`, `dnf`, …).

Keep changes project-local instead: virtualenvs, project-local dependencies, and in-repo config files. If a global change or install genuinely seems necessary, stop and tell me the exact command to run rather than running it yourself.

## Notes repo

I may keep a personal notes repo at `~/Repositories/notes` or `~/notes` — check in that order; if neither exists, this section does not apply.

When you work in it, follow its own `CLAUDE.md`. Read that file before your first edit there: Claude Code loads it only for sessions started inside the notes repo, so from any other directory it isn't in your context.

Take notes proactively while working — don't wait to be asked. When a task turns up something that keeps its value afterward, write it there: non-obvious discoveries, the reasoning behind a decision, useful references, fixes for fiddly problems, anything I'd plausibly look up later. Keep it to durable, reusable knowledge, not a step-by-step log. Requests to "note that down" or to save findings while working elsewhere go here too.

Consult it too, at your discretion. When a task might already be covered there — a past investigation, the rationale for an earlier decision, a fix for something fiddly — check the notes before working it out from scratch. Use judgement about when that's worth doing; not every task needs it.

## Review before every commit

Before each `git commit` you run, in any repo, have the `commit-reviewer` subagent review the staged change, and wait for its verdict before committing.

1. Stage exactly what the commit will contain.
2. Start `commit-reviewer` in the foreground. Its brief is only: the repo path, the commit message you plan to use, and the diff command if it isn't `git diff --cached` (for `--amend`, `git diff --cached HEAD~1`; for `commit -a`, `git diff HEAD`). Don't describe the change, the request or your reasoning: the reviewer reads the user's messages and the diff itself, so a misreading of yours can't steer it.
3. On `BLOCK`, fix the findings, restage, and run a fresh review. Don't commit over a block. If you think a finding is wrong, tell me and let me decide. If a finding raises a decision rather than a defect, ask me as "Review after opening a PR" describes below.
4. On `PASS`, commit, and report the pass in one line of your reply (such as `Commit review: PASS`). The commit-review band already shows the full verdict, so don't repeat its lines or recap its notes. If its `Sources:` line says it couldn't get the user's messages or the diff, say so in that same line.

Skip it only when I say to for that commit.

Push in a separate command from the commit, never chained onto it, so a missed review can still be fixed locally before anything is online.

## Review after opening a PR

Right after you open a pull request (`gh pr create`), review it before moving on:

1. Run `/code-review <PR number>` with no `--comment` or `--fix`, and wait for it.
2. If it finds nothing, say so in one line.
3. Otherwise list the findings, then ask me with `AskUserQuestion` which of these I want, in this order:
   - **Post, then fix (Recommended):** post them as below, then deal with each posted comment: fix it, or reply on its thread with why it needs no fix. A comment that raises a decision goes to me first, as the rule below says. Commit the fixes (with the commit review above), push to the PR branch, then reply on each fixed thread with the commit that fixed it. Last, resolve every thread you dealt with: get the thread IDs from GraphQL `pullRequest.reviewThreads` (the REST review returns only comment IDs), then call `resolveReviewThread`. A finding in the review body has no thread: answer it in one PR comment instead.
   - **Post them on the PR:** one PR review with event `COMMENT`, through `gh api repos/<owner>/<repo>/pulls/<n>/reviews`, with an inline comment at each finding's file and line. Put findings that aren't on a changed line in the review body. Change nothing locally.
   - **Fix them locally:** fix them, commit (with the commit review above), and push to the PR branch.

Don't post or fix anything before I answer. Skip the review only when I say to for that PR.

Whenever you fix review findings, PR review comments or commit-review findings, under any of these options or otherwise: when one raises a decision rather than a defect (a trade-off, a design or product choice, behaviour that may be intended), don't settle it yourself. Ask me with `AskUserQuestion`, and leave its PR thread, if it has one, unresolved until I answer.
