#!/usr/bin/env bash
#
# Helper for the commit-reviewer subagent — print the user's own messages from
# a Claude Code session transcript, oldest first.
#
# Not a hook itself: the reviewer runs it as
#   ~/.claude/hooks/user-messages.sh $CLAUDE_CODE_SESSION_ID
# to learn what the user asked for, without the committing agent's framing.
# A transcript path works too.
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

if [ $# -ne 1 ]; then
  echo "usage: user-messages.sh <transcript .jsonl | session id>" >&2
  exit 2
fi

transcript=$1
# A session id (the commit-reviewer subagent passes $CLAUDE_CODE_SESSION_ID)
# names ~/.claude/projects/<project>/<session id>.jsonl.
if [ ! -r "$transcript" ]; then
  transcript=$(ls ~/.claude/projects/*/"$1".jsonl 2>/dev/null | head -n 1 || true)
fi
if [ -z "$transcript" ] || [ ! -r "$transcript" ]; then
  echo "user-messages.sh: no readable transcript for '$1'" >&2
  exit 2
fi

jq -r 'select(.type == "user" and (.message.content | type) == "string") | .message.content' "$transcript"
