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
# string and whose origin.kind is "human" or "bridge" (Remote Control); an
# entry without origin counts unless it is isMeta or a compaction summary. A
# prompt typed while the agent worked is a queued_command attachment instead.
# Harness-injected strings, such as subagent hand-backs ("peer"), task
# notifications and retry notices (isMeta), have another origin and are dropped.
# Answers to AskUserQuestion are tool results; they come from
# toolUseResult.answers, and the questions from the agent's tool_use input.
# Each reply is preceded by the agent's last few messages before it, so an
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

# Each line is parsed on its own (fromjson?), so a last line the session is
# still writing is skipped instead of failing the whole read.
jq -rnR '
  # An agent block keeps the last 3 text messages before a reply, each cut to
  # 2000 characters: enough to read an approval against, without the session.
  # Questions it asked are kept apart and always shown.
  def agent: (.agent[-3:] | map(if length > 2000 then .[:2000] + " …" else . end)) + .asked
    | if . != [] then "[agent, its last messages before this reply]\n\(join("\n\n"))\n" else "" end;
  def asked: [.input.questions[]? | "[agent asked] \(.question)"
    + ([.options[]?.label] | if . != [] then " (options: \(join(" / ")))" else "" end)];
  # A typed prompt, a prompt queued while the agent worked, or a Remote
  # Control prompt; not a hand-back, task notification or retry notice.
  def human: ((.origin.kind // "human") | IN("human", "bridge")) and (.isMeta | not);
  foreach (inputs | fromjson? | objects) as $e ({agent: [], asked: [], out: null};
    .out = null
    | if $e.isSidechain == true then .
      elif $e.type == "assistant" then
        .agent += [$e.message.content | arrays | .[] | select(.type == "text") | .text]
        | .asked += [$e.message.content | arrays | .[] | select(.type == "tool_use" and .name == "AskUserQuestion") | asked[]]
      elif $e.type == "user" and ($e.message.content | type) == "string"
           and ($e.isCompactSummary | not) and ($e | human) then
        .out = agent + "[user]\n\($e.message.content)\n" | .agent = [] | .asked = []
      elif $e.type == "attachment" and $e.attachment.type == "queued_command"
           and $e.attachment.commandMode == "prompt" and ($e.attachment.prompt | type) == "string"
           and ($e.attachment | human) then
        .out = agent + "[user, while the agent worked]\n\($e.attachment.prompt)\n" | .agent = [] | .asked = []
      elif $e.type == "user" and ($e.toolUseResult | type) == "object"
           and ($e.toolUseResult.answers | type) == "object" then
        .out = agent + ([$e.toolUseResult.answers | to_entries[]
          | "[user answered] \(.key)\n=> \(.value)"
            + ($e.toolUseResult.annotations[.key].notes? // "" | if . != "" then "\n(notes: \(.))" else "" end)
        ] | join("\n")) + "\n"
        | .agent = [] | .asked = []
      else . end;
    .out // empty)' "$transcript"
