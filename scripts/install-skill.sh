#!/usr/bin/env bash
set -euo pipefail

# Resolve the real directory containing this script (npm global bins are symlinks under bin/).
real_dir_of() {
  local path="$1"
  local dir
  while [[ -L "$path" ]]; do
    dir="$(cd "$(dirname "$path")" && pwd)"
    path="$(readlink "$path")"
    [[ "$path" != /* ]] && path="${dir}/${path}"
  done
  cd "$(dirname "$path")" && pwd
}

find_skill_source() {
  local script_dir candidate

  script_dir="$(real_dir_of "$0")"
  candidate="${script_dir}/../.cursor/skills/goal"
  if [[ -f "${candidate}/SKILL.md" ]]; then
    cd "${candidate}" && pwd
    return 0
  fi

  if command -v npm >/dev/null 2>&1; then
    local global_root local_root
    global_root="$(npm root -g 2>/dev/null || true)"
    if [[ -n "${global_root}" ]]; then
      candidate="${global_root}/cursor-goal/.cursor/skills/goal"
      if [[ -f "${candidate}/SKILL.md" ]]; then
        cd "${candidate}" && pwd
        return 0
      fi
    fi

    local_root="$(npm root 2>/dev/null || true)"
    if [[ -n "${local_root}" ]]; then
      candidate="${local_root}/cursor-goal/.cursor/skills/goal"
      if [[ -f "${candidate}/SKILL.md" ]]; then
        cd "${candidate}" && pwd
        return 0
      fi
    fi
  fi

  echo "error: could not find cursor-goal skill source (expected SKILL.md under package .cursor/skills/goal)" >&2
  echo "hint: reinstall with: npm install -g cursor-goal" >&2
  return 1
}

SOURCE="$(find_skill_source)"

usage() {
  cat <<'EOF'
Install the /goal Cursor skill.

Usage:
  cursor-goal-install-skill [--global] [target-dir]
  install-skill.sh [--global] [target-dir]

  --global, -g    Install to ~/.cursor/skills/goal (all workspaces)
  target-dir      Install to <target-dir>/.cursor/skills/goal (default: $PWD)

After a global npm install:
  npm install -g cursor-goal
  cursor-goal-install-skill --global
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
