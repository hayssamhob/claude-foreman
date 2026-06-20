#!/usr/bin/env bash
# PostToolUse hook — runs tsc --noEmit after edits to TypeScript source files.
# Scoped (rule 12): only fires on Edit|Write to src/**/*.ts or test/**/*.ts.
# This is the G8 guardrail as enforcement, not suggestion: Vitest strips types,
# so a test can pass while the build is broken. This hook catches that at edit time.

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null || echo "")

# Only check .ts files under src/ or test/ or tests/ — scoped, not unconditional.
if [ -z "$file_path" ]; then
  exit 0
fi

case "$file_path" in
  */src/*.ts|*/test/*.ts|*/tests/*.ts)
    # Run a typecheck. If it fails, warn but don't block (exit 0)
    # — the real gate is `npm run build` in the done-contract.
    # Blocking on every edit would make iterative work painful.
    if ! npx tsc --noEmit 2>/dev/null; then
      echo "⚠  tsc --noEmit has errors after editing $file_path" >&2
      echo "   Run 'npm run build' to see details. Fix before opening a PR." >&2
    fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
