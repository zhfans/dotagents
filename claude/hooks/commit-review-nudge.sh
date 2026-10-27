#!/usr/bin/env bash
#
# PreToolUse and PostToolUse hook for the commit review the user-level
# CLAUDE.md asks for ("Review before every commit": run the commit-reviewer
# subagent on the staged change and commit only on PASS). Instructions in
# CLAUDE.md fade over a long session, so this hook makes sure a skipped review
# is caught before the commit is pushed.
#
# - PreToolUse: refuse a command that both commits and pushes, with a reason
#   telling the agent to push in a separate command. Otherwise a commit that
#   skipped the review would be online before any reminder arrived.
# - PostToolUse, after a successful git commit: remind the agent to run the
#   review now if it skipped it, fix findings with --amend, and not push until
#   it passes. A reminder can't come before the commit: a PreToolUse hook's
#   additionalContext reaches the agent next to the tool result, so after the
#   command has run. Since nothing is pushed yet, a late review can still be
#   fixed locally. It fires after reviewed commits too, and blocks nothing.
#
# Wired with "if": "Bash(git *)" on both events. The "if" names only the
# command for the reason given in pr-review-nudge.sh: a pattern naming
# arguments runs the hook anyway on any command containing $(), backticks or
# $VAR. The script narrows "git *" to git commit / git push (allowing -C/-c
# options before the subcommand), matched after removing heredoc bodies and
# quoted strings, so text that only mentions them doesn't count. It skips a
# dry run or a commit git reports had nothing to commit.
#
# Requires jq. If it's missing, exit silently, as pr-review-nudge.sh does.
#
# Deployed to ~/.claude/hooks/ by the dotagents repo's install-claude skill;
# wired as PreToolUse and PostToolUse hooks in ~/.claude/settings.json (see
# that repo's claude/settings.hooks.json).

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

# One jq call reads the event, the command with its heredoc bodies and quoted
# strings removed (so a commit message that mentions "git push" doesn't count),
# and whether git said there was nothing to commit.
filter=$(cat <<'JQ'
[ .hook_event_name // "",
  (.tool_input.command // ""
    | gsub("<<-?\\s*(?<q>['\"]?)(?<w>\\w+)\\k<q>(?<rest>[^\\n]*)\\n.*?\\n[ \\t]*\\k<w>(?=\\n|$)"; "\(.rest)"; "p")
    | gsub("'[^']*'"; "")
    | gsub("\"(?:[^\"\\\\]|\\\\.)*\""; ""; "p")),
  ((.tool_response // "" | tostring) | test("nothing to commit|no changes added to commit") | tostring)
] | join("\u0000")
JQ
)
{
  IFS= read -r -d '' event
  IFS= read -r -d '' command
  IFS= read -r -d '' is_noop
} < <(jq -j "$filter" 2>/dev/null)

commit_re='(^|[;&|({[:space:]])git([[:space:]]+-[cC][[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)'
push_re='(^|[;&|({[:space:]])git([[:space:]]+-[cC][[:space:]]+[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)'
if [[ ! "$command" =~ $commit_re ]]; then
  exit 0
fi

if [[ "$event" == PreToolUse ]]; then
  if [[ "$command" =~ $push_re ]]; then
    jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny",
      permissionDecisionReason: "This command commits and pushes at once. Run git commit and git push as separate commands, as the user-level CLAUDE.md says, so a missed commit review can still be fixed locally before the push."}}'
  fi
  exit 0
fi

# A dry run, or a commit with nothing to commit, made no commit.
if [[ "$is_noop" == true || "$command" =~ [[:space:]]--dry-run([[:space:]]|$) ]]; then
  exit 0
fi

jq -n '{hookSpecificOutput: {hookEventName: "PostToolUse",
  additionalContext: "A git commit was just made. If the commit-reviewer subagent did not pass this exact change before the commit, follow the user-level CLAUDE.md section \"Review before every commit\" now, with the diff command git show HEAD, and fix any finding with git commit --amend. Do not push until it passes."}}'
