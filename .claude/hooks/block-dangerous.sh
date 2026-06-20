#!/usr/bin/env bash
# PreToolUse hook — blocks dangerous commands deterministically.
# The model cannot talk its way past exit code 2.
# Scoped (rule 12): only inspects Bash tool calls. Reads the command from stdin.

set -euo pipefail

# Claude Code passes the tool input as JSON on stdin.
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

# If we couldn't parse, let the call through (fail open, not silent block).
if [ -z "$cmd" ]; then
  exit 0
fi

# Patterns that must never run. Add patterns here, not in CLAUDE.md.
blocked_patterns=(
  'rm -rf /'
  'rm -rf ~'
  'rm -rf \*'
  'git push --force'
  'git push -f '
  'git push origin main'
  'git checkout main'
  'git rebase -i'
  'git config --global'
  'gh pr merge --force'
  'DROP TABLE'
  'DROP SCHEMA'
)

for pattern in "${blocked_patterns[@]}"; do
  if echo "$cmd" | grep -qiE "$pattern"; then
    echo "BLOCKED by .claude/hooks/block-dangerous.sh: matched '$pattern'" >&2
    echo "Command: $cmd" >&2
    echo "If this is genuinely needed, ask the human to run it manually." >&2
    exit 2
  fi
done

exit 0
