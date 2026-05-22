#!/usr/bin/env bash
set -euo pipefail

SOURCE="$(cd "$(dirname "$0")/../.cursor/skills/goal" && pwd)"

usage() {
  cat <<'EOF'
Install the /goal Cursor skill.

Usage:
  install-skill.sh [--global] [target-dir]

  --global        Install to ~/.cursor/skills/goal (all workspaces)
  target-dir      Install to <target-dir>/.cursor/skills/goal (default: $PWD)
EOF
}

GLOBAL=false
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global|-g)
      GLOBAL=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      TARGET="$1"
      shift
      ;;
  esac
done

if [[ "$GLOBAL" == true ]]; then
  DEST="${HOME}/.cursor/skills/goal"
else
  DEST="${TARGET:-$PWD}/.cursor/skills/goal"
fi

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SOURCE" "$DEST"
echo "Installed goal skill to $DEST"
