#!/usr/bin/env bash
#
# UserPromptSubmit hook — on a session's first prompt only, have the agent
# check the notes repo for context on that request before it starts work.
#
# SessionStart can't do this: it fires before the user has typed anything, so
# it can't know what to look up. UserPromptSubmit sees the prompt, but fires on
# every turn, so a marker file per session_id keeps this to the first one.
# Markers live in the per-user cache dir, not a shared /tmp path another user
# could create first or fill with symlinks. Markers older than 30 days are
# deleted on each run; a session resumed after that gets one more lookup,
# which the message's wording allows for.
#
# The marker is written only once the output is ready, and if it can't be
# written the hook says nothing: otherwise a failed write would repeat the
# lookup on every turn.
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
session_id=$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)
# It becomes a file name, so allow only id characters (Claude Code sends UUIDs).
[[ "$session_id" =~ ^[A-Za-z0-9_-]+$ ]] || exit 0

marker_dir="${XDG_CACHE_HOME:-$HOME/.cache}/claude-notes-lookup"
marker="$marker_dir/$session_id"
[[ -e "$marker" ]] && exit 0

notes=""
for dir in "$HOME/Repositories/notes" "$HOME/notes"; do
  if [[ -d "$dir" ]]; then
    notes="$dir"
    break
  fi
done
[[ -n "$notes" ]] || exit 0

message="Before starting on this request, search the notes repo at $notes for anything relevant to this request: past investigations, the reasoning behind earlier decisions, fixes for fiddly problems, references. If the search needs more than a few reads, hand it to a read-only subagent and keep only its conclusions. Use what you find; if nothing is relevant, or the request is too small to need it, carry on without mentioning this check."

output=$(jq -n --arg msg "$message" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $msg
  }
}') || exit 0

mkdir -p "$marker_dir" 2>/dev/null && touch "$marker" 2>/dev/null || exit 0
find "$marker_dir" -type f -mtime +30 -delete 2>/dev/null
printf '%s\n' "$output"
