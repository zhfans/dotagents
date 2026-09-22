# CLAUDE.md

Project instructions for working *on* this repo — distinct from
`claude/CLAUDE.md`, which is payload deployed to `~/.claude/CLAUDE.md`, not
guidance for this repo itself.

## GitHub identity

This repo's commits and PRs belong to the `zhfans` GitHub account (matching
the repo-local `git config user.name`/`user.email`), not `zhf-akina`, the
account `gh` is authenticated as by default on this machine.

Prefix every `gh` command run in this repo with the `zhfans` token:

```bash
GH_TOKEN=$(gh auth token --user zhfans) gh pr create ...
```

Requires `zhfans` to already be logged in via `gh auth login` (a one-time,
interactive step per machine). If a `gh` command fails, or something gets
attributed to the wrong account, check `gh auth status` first.
