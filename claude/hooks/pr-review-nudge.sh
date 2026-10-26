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
# Wired with "if": "Bash(gh *)", and PostToolUse fires only when the command
# succeeded. The "if" names only the command on purpose: a pattern that also
# names arguments, like "Bash(gh pr create*)", runs the hook anyway on any
# command containing $(), backticks or $VAR (documented in the hooks
# reference), and right after install that made this nudge fire on most Bash
# calls. "gh *" filters reliably but also passes gh pr view, gh api and the
# rest, so the script checks two things itself: the command mentions
# "pr create", and its output has a PR URL (".../pull/<number>"), which
# gh pr create prints on success. PostToolUse stdout isn't model context
# unless it's JSON with additionalContext, hence the JSON.
#
# Requires jq for that check. If it's missing, exit silently, as
# notes-checkpoint.sh does: no nudge beats a hook error on every Bash call.
#
# Deployed to ~/.claude/hooks/ by the dotagents repo's install-claude skill;
# wired as a PostToolUse hook in ~/.claude/settings.json (see that repo's
# claude/settings.hooks.json).

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)
response=$(jq -r '.tool_response | tostring' <<<"$input" 2>/dev/null)
if [[ "$command" != *"pr create"* || ! "$response" =~ /pull/[0-9]+ ]]; then
  exit 0
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "A pull request was just opened. Before moving on, follow the user-level CLAUDE.md section \"Review after opening a PR\": run /code-review on it, then ask the user whether to post the findings on the PR or fix them locally."
  }
}
EOF
