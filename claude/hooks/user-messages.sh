#!/usr/bin/env bash
#
# Helper for the commit-review agent hook — print the user's own messages from
# a Claude Code session transcript, oldest first.
#
# Not a hook itself: the reviewer runs it as
#   ~/.claude/hooks/user-messages.sh <transcript_path>
# to learn what the user asked for, without the committing agent's framing.
# It exists as a script so one narrow permission rule can allow it: in an
# auto-mode session the reviewer's ad-hoc jq on the transcript was refused,
# so the review went ahead blind and blocked on guesses.
#
# Typed prompts are the transcript's "user" entries whose content is a plain
# string; tool results are "user" entries with list content, and hook output
# isn't stored as a user string, so neither comes through.
#
# Deployed to ~/.claude/hooks/ by the dotagents repo's install-claude skill and
# allowed in ~/.claude/settings.json (see that repo's claude/settings.hooks.json).

set -euo pipefail

if [ $# -ne 1 ] || [ ! -r "$1" ]; then
  echo "usage: user-messages.sh <readable transcript .jsonl>" >&2
  exit 2
fi

jq -r 'select(.type == "user" and (.message.content | type) == "string") | .message.content' "$1"
