#!/usr/bin/env bash
# context-reset SessionStart hook.
#
# Registered under settings.json -> hooks.SessionStart (matcher ""), so it fires on
# EVERY session start but only acts on two sources:
#   - source "clear"   : auto-resume from the newest un-archived checkpoint (kills the
#                        3rd manual step — user just types /context-reset then /clear).
#   - source "compact" : remind the user to /context-reset + /clear, right after a
#                        (usually auto-) compaction — the degradation event they care about.
# On any other source (startup / resume) it outputs nothing and exits.
#
# A SessionStart hook's stdout is injected into the fresh session's context, which is how
# the resume/reminder reaches Claude. Always exits 0 so it can never block a session.

input="$(cat 2>/dev/null)"

mode="other"
case "$input" in
  *'"source":"clear"'*|*'"source": "clear"'*)     mode="clear" ;;
  *'"source":"compact"'*|*'"source": "compact"'*) mode="compact" ;;
esac
[ "$mode" = "other" ] && exit 0

ckdir="$HOME/.claude/checkpoints"
latest="$(ls -t "$ckdir"/*.md 2>/dev/null | grep -v '/README\.md$' | head -1)"

if [ "$mode" = "clear" ]; then
  if [ -n "$latest" ]; then
    cat <<EOF
[context-reset] A checkpoint saved by /context-reset is waiting at:
  $latest
If the user's next message continues that work, RESUME from it: read the file, give a 3-5
line orientation (goal, what's done, the next step), continue from its "Next steps", then
archive it with:  mv "$latest" "$ckdir/archive/"
If the next message is clearly unrelated, just note that a checkpoint exists and ask whether
to resume or archive it. Either way, do NOT reload any other prior context.
EOF
  fi
  exit 0
fi

# mode = compact
printf '%s\n' "[context-reset] The context was just compacted -- repeated compaction is exactly what degrades quality over a long session. At the next natural pause (never interrupt work in progress), remind the user: /context-reset saves a checkpoint, then /clear gives a genuinely clean window and the checkpoint auto-reloads. Mention it once; don't nag."
if [ -n "$latest" ]; then
  printf '%s\n' "A checkpoint already exists at $latest -- offer to resume from it instead."
fi
exit 0
