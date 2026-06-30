#!/bin/bash
# Ralph - long-running AI agent loop for agent-platform.
# Usage: ./ralph.sh [--tool amp|claude|codex] [--dry-run] [max_iterations]

set -euo pipefail

TOOL="codex"
MAX_ITERATIONS=10
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage: scripts/ralph/ralph.sh [--tool amp|claude|codex] [--dry-run] [max_iterations]

Runs Ralph iterations against scripts/ralph/prd.json.

Options:
  --tool <name>       Agent CLI to run: amp, claude, or codex. Default: codex.
  --tool=<name>      Same as --tool <name>.
  --dry-run          Print the selected command and exit without invoking an agent.
  -h, --help         Show this help.

Examples:
  scripts/ralph/ralph.sh --tool codex 5
  scripts/ralph/ralph.sh --tool codex --dry-run 1
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="${2:-}"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      else
        echo "Error: Unknown argument '$1'." >&2
        usage >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ "$TOOL" != "amp" && "$TOOL" != "claude" && "$TOOL" != "codex" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be amp, claude, or codex." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

read_branch_name() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo ""
    return
  fi

  node -e "
const fs = require('fs');
try {
  const prd = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  process.stdout.write(typeof prd.branchName === 'string' ? prd.branchName : '');
} catch {
  process.stdout.write('');
}
" "$PRD_FILE"
}

agent_command_description() {
  case "$TOOL" in
    amp)
      echo "amp --dangerously-allow-all < $SCRIPT_DIR/prompt.md"
      ;;
    claude)
      echo "claude --dangerously-skip-permissions --print < $SCRIPT_DIR/CLAUDE.md"
      ;;
    codex)
      echo "codex exec --cd $PROJECT_ROOT --sandbox danger-full-access --ask-for-approval never <contents of $SCRIPT_DIR/CODEX.md>"
      ;;
  esac
}

run_agent_iteration() {
  case "$TOOL" in
    amp)
      amp --dangerously-allow-all < "$SCRIPT_DIR/prompt.md"
      ;;
    claude)
      claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/CLAUDE.md"
      ;;
    codex)
      codex exec \
        --cd "$PROJECT_ROOT" \
        --sandbox danger-full-access \
        --ask-for-approval never \
        "$(cat "$SCRIPT_DIR/CODEX.md")"
      ;;
  esac
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Ralph dry run"
  echo "Tool: $TOOL"
  echo "Project root: $PROJECT_ROOT"
  echo "PRD: $PRD_FILE"
  echo "Progress: $PROGRESS_FILE"
  echo "Command: $(agent_command_description)"
  exit 0
fi

if [[ ! -f "$PRD_FILE" ]]; then
  echo "Error: Missing $PRD_FILE. Create it from scripts/ralph/prd.json.example before running Ralph." >&2
  exit 1
fi

if [[ "$TOOL" == "codex" && ! -f "$SCRIPT_DIR/CODEX.md" ]]; then
  echo "Error: Missing $SCRIPT_DIR/CODEX.md for --tool codex." >&2
  exit 1
fi

if [[ -f "$PRD_FILE" && -f "$LAST_BRANCH_FILE" ]]; then
  CURRENT_BRANCH=$(read_branch_name)
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [[ -n "$CURRENT_BRANCH" && -n "$LAST_BRANCH" && "$CURRENT_BRANCH" != "$LAST_BRANCH" ]]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [[ -f "$PROGRESS_FILE" ]] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "Archived to: $ARCHIVE_FOLDER"

    {
      echo "# Ralph Progress Log"
      echo "Started: $(date)"
      echo "---"
    } > "$PROGRESS_FILE"
  fi
fi

CURRENT_BRANCH=$(read_branch_name)
if [[ -n "$CURRENT_BRANCH" ]]; then
  echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
fi

if [[ ! -f "$PROGRESS_FILE" ]]; then
  {
    echo "# Ralph Progress Log"
    echo "Started: $(date)"
    echo "---"
  } > "$PROGRESS_FILE"
fi

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  OUTPUT=$(run_agent_iteration 2>&1 | tee /dev/stderr) || true

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks."
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
