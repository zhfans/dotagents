#!/usr/bin/env bash
#
# UserPromptSubmit hook — before each turn, put the user-level CLAUDE.md back in
# front of the agent.
#
# CLAUDE.md is loaded once at session start and fades over a long session (the
# note-taking instruction not being followed is what prompted this, but the
# reminder is deliberately general — the whole file matters). `UserPromptSubmit`
# is one of the few events where a hook's plain stdout is injected into the
# model's context for the upcoming turn, so this script is just that one line.
# It blocks nothing and the model may ignore it. The guidance lives in
# CLAUDE.md; this only points back at it.
#
# Deployed to ~/.claude/hooks/ by the dotagents repo's install-claude skill;
# wired as a UserPromptSubmit hook in ~/.claude/settings.json (see that repo's
# claude/settings.hooks.json).

cat <<'EOF'
Keep the guidance in the user-level CLAUDE.md in mind as you work.
EOF
