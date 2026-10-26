#!/usr/bin/env bash
#
# PostToolUse hook — right after the agent opens a pull request, remind it to
# run the PR review the user-level CLAUDE.md asks for.
#
# The review itself is an instruction in CLAUDE.md ("Review after opening a
# PR"): run /code-review on the PR, then ask the user whether to post the
# findings on the PR or fix them locally. This hook only puts that step in
# front of the agent at the moment it applies, so it isn't forgotten after a
# long session. It blocks nothing and the agent can still read past it.
#
# Wired with "if": "Bash(gh pr create*)", so it runs only for that command, and
# PostToolUse fires only when the command succeeded. PostToolUse stdout isn't
# model context unless it's JSON with additionalContext, hence the JSON. The
# output is fixed, so the script reads no input and needs no jq.
#
# Deployed to ~/.claude/hooks/ by the dotagents repo's install-claude skill;
# wired as a PostToolUse hook in ~/.claude/settings.json (see that repo's
# claude/settings.hooks.json).

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "A pull request was just opened. Before moving on, follow the user-level CLAUDE.md section \"Review after opening a PR\": run /code-review on it, then ask the user whether to post the findings on the PR or fix them locally."
  }
}
EOF
