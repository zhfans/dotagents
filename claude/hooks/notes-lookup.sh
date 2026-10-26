#!/usr/bin/env bash
#
# UserPromptSubmit hook — on a session's first prompt only, have the agent
# check the notes repo for context on that request before it starts work.
#
# SessionStart can't do this: it fires before the user has typed anything, so
# it can't know what to look up. UserPromptSubmit sees the prompt, but fires on
# every turn, so a marker file per session_id keeps this to the first one.
# The marker lives in the temp dir: it's throwaway state, and a session resumed
# after it's cleared just gets one more lookup.
#
# The hook only points the agent at the notes; the agent does the search. A
# keyword grep here would match the prompt's wording, not its meaning. The
# message is additionalContext, so it's an instruction the agent can still
# read past, not a gate.
#
# Notes-repo location matches the user-level CLAUDE.md: ~/Repositories/notes,
# then ~/notes; with neither, the hook does nothing.
#
# Requires jq, like notes-checkpoint.sh; without it, exit silently rather than
# erroring on every prompt.
#
# Deployed to ~/.claude/hooks/ by the dotagents repo's install-claude skill;
# wired as a UserPromptSubmit hook in ~/.claude/settings.json (see that repo's
# claude/settings.hooks.json).

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input=$(cat)
session_id=$(jq -r '.session_id // empty' <<<"$input")
[[ -n "$session_id" ]] || exit 0

marker_dir="${TMPDIR:-/tmp}/claude-notes-lookup"
marker="$marker_dir/$session_id"
[[ -e "$marker" ]] && exit 0
mkdir -p "$marker_dir" && touch "$marker"

notes=""
for dir in "$HOME/Repositories/notes" "$HOME/notes"; do
  if [[ -d "$dir" ]]; then
    notes="$dir"
    break
  fi
done
[[ -n "$notes" ]] || exit 0

message="This is the first message of the session. Before starting on it, search the notes repo at $notes for anything relevant to this request: past investigations, the reasoning behind earlier decisions, fixes for fiddly problems, references. If the search needs more than a few reads, hand it to a read-only subagent and keep only its conclusions. Use what you find; if nothing is relevant, or the request is too small to need it, carry on without mentioning this check."

jq -n --arg msg "$message" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $msg
  }
}'
