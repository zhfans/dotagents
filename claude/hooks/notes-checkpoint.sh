#!/usr/bin/env bash
#
# Stop hook — before the turn ends, force one explicit check against the
# user-level CLAUDE.md's "take notes proactively" instruction.
#
# claude-md-reminder.sh (UserPromptSubmit) re-surfaces CLAUDE.md every turn,
# but a real session confirmed that alone doesn't work: the agent can trace
# and explain the reminder mechanism itself without that ever triggering a
# check against the notes repo. Stop fires once per turn, right after
# whatever might be worth noting actually happened, and can force one more
# round instead of just hoping the agent interrupts itself.
#
# Returns hookSpecificOutput.additionalContext rather than decision:block, so
# Claude Code labels this "Stop hook feedback" in the transcript instead of a
# hook error — nothing is wrong when it fires, it's a routine checkpoint.
#
# The prompt tells the agent to stay quiet on a "no" — the round-trip still
# happens every turn (the hook still can't tell in advance whether there's
# anything to note), but a clean turn now ends without a "nothing to note"
# filler line. Only a "yes" produces visible output: the note itself.
#
# The prompt also spells out committing and pushing: as the notes repo grew,
# agents kept writing the note and then stopping with it uncommitted or
# unpushed. It asks on every turn, not only when there's a new note, so an
# earlier note left unpushed is still caught. It defers to the notes repo's
# CLAUDE.md for which files need the user's approval first.
#
# stop_hook_active is the documented anti-loop guard: true means a Stop hook
# already forced a continuation this turn, so let it stop now. (Claude Code
# also hard-caps at 8 consecutive blocks regardless, but this keeps it to
# one.)
#
# Requires jq. install-claude deploys this script to arbitrary machines
# without guaranteeing jq is present, and jq isn't preinstalled on macOS —
# so if it's missing, exit silently rather than erroring on every single
# Stop event. The checkpoint just doesn't run instead of spamming a
# hook-error notice.

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input=$(cat)
stop_hook_active=$(jq -r '.stop_hook_active // false' <<<"$input")

if [[ "$stop_hook_active" == "true" ]]; then
  exit 0
fi

message="Before stopping: does anything from this turn belong in the notes repo per the user-level CLAUDE.md (a discovery, a decision's rationale, a fix, a reference worth keeping)? If yes, write it now. Either way, if this session has note edits that are still uncommitted or unpushed (this turn's or earlier ones), commit and push them now. Follow the notes repo's own CLAUDE.md, which says which files must wait for the user's approval and what to do when the push isn't a fast-forward, and the user-level commit review. If there is nothing to write or push, just stop — don't mention this check or say that there was nothing to note."

jq -n --arg msg "$message" '{
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $msg
  }
}'
