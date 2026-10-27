#!/usr/bin/env bash
#
# Helper for the commit-reviewer subagent — print the user's own messages and
# answers, each after the agent's messages it replies to, from
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
# string and whose origin.kind is "human" (an entry without origin counts, unless
# isMeta or a compaction summary). Harness-injected strings, such as subagent
# hand-backs ("peer"), task notifications and retry notices (isMeta), have
# another origin and are dropped.
# Answers to AskUserQuestion are tool results; they come from toolUseResult.answers.
# Each reply is preceded by the agent's text messages since the previous one, so an
# approval like "sure, do that" can be read against what it approved.
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

jq -rn '
  def agent: if .agent != [] then "[agent, its messages since the previous reply]\n\(.agent | join("\n\n"))\n" else "" end;
  foreach inputs as $e ({agent: [], out: null};
    .out = null
    | if $e.isSidechain == true then .
      elif $e.type == "assistant" then
        .agent += [$e.message.content | arrays | .[] | select(.type == "text") | .text]
      elif $e.type == "user" and ($e.message.content | type) == "string"
           and ($e.isMeta | not) and ($e.isCompactSummary | not)
           and ($e.origin.kind // "human") == "human" then
        .out = agent + "[user]\n\($e.message.content)\n" | .agent = []
      elif $e.type == "user" and ($e.toolUseResult | type) == "object"
           and ($e.toolUseResult.answers | type) == "object" then
        .out = agent + ([$e.toolUseResult.answers | to_entries[]
          | "[user answered] \(.key)\n=> \(.value)"
            + ($e.toolUseResult.annotations[.key].notes? // "" | if . != "" then "\n(notes: \(.))" else "" end)
        ] | join("\n")) + "\n"
        | .agent = []
      else . end;
    .out // empty)' "$transcript"
