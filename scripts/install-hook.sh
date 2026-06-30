#!/usr/bin/env bash
set -euo pipefail

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

find_evaluate_goal_script() {
  local script_dir candidate resolved

  script_dir="$(real_dir_of "$0")"
  candidate="${script_dir}/evaluate-goal.sh"
  if [[ -f "${candidate}" ]]; then
    resolved="$(cd "$(dirname "${candidate}")" && pwd)/evaluate-goal.sh"
    echo "${resolved}"
    return 0
  fi

  if command -v npm >/dev/null 2>&1; then
    local global_root local_root
    global_root="$(npm root -g 2>/dev/null || true)"
    if [[ -n "${global_root}" ]]; then
      candidate="${global_root}/cursor-goal/scripts/evaluate-goal.sh"
      if [[ -f "${candidate}" ]]; then
        resolved="$(cd "$(dirname "${candidate}")" && pwd)/evaluate-goal.sh"
        echo "${resolved}"
        return 0
      fi
    fi

    local_root="$(npm root 2>/dev/null || true)"
    if [[ -n "${local_root}" ]]; then
      candidate="${local_root}/cursor-goal/scripts/evaluate-goal.sh"
      if [[ -f "${candidate}" ]]; then
        resolved="$(cd "$(dirname "${candidate}")" && pwd)/evaluate-goal.sh"
        echo "${resolved}"
        return 0
      fi
    fi
  fi

  echo "error: could not find evaluate-goal.sh (expected under package scripts/)" >&2
  echo "hint: run npm run build && npm link from your cursor-goal clone" >&2
  return 1
}

usage() {
  cat <<'EOF'
Install the cursor-goal Cursor stop hook.

Usage:
  cursor-goal-install-hook [--global] [target-dir]
  install-hook.sh [--global] [target-dir]

  --global, -g    Install to ~/.cursor/hooks.json (all workspaces)
  target-dir      Install to <target-dir>/.cursor/hooks.json (default: $PWD)

Notes:
  - Requires Node.js 22+ on PATH for the hook wrapper.
  - Stop hooks run in local Cursor Agent chat only (not Cloud Agents).
  - Link goals with --conversation-id when setting/resuming so the hook can find state.

After cloning and linking:

  git clone https://github.com/ndhotsky/cursor-goal.git
  cd cursor-goal && npm install && npm run build && npm link
  cursor-goal-install-skill --global
  cursor-goal-install-hook --global
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

EVALUATE_GOAL_SCRIPT="$(find_evaluate_goal_script)"

if [[ "$GLOBAL" == true ]]; then
  HOOKS_FILE="${HOME}/.cursor/hooks.json"
else
  HOOKS_FILE="${TARGET:-$PWD}/.cursor/hooks.json"
fi

HOOKS_FILE="$HOOKS_FILE" EVALUATE_GOAL_SCRIPT="$EVALUATE_GOAL_SCRIPT" node <<'NODE'
const fs = require("node:fs")
const path = require("node:path")

const hooksFile = process.env.HOOKS_FILE
const command = process.env.EVALUATE_GOAL_SCRIPT

if (!hooksFile || !command) {
  console.error("error: missing hooks file or evaluate-goal script path")
  process.exit(1)
}

let config = { version: 1, hooks: {} }
if (fs.existsSync(hooksFile)) {
  config = JSON.parse(fs.readFileSync(hooksFile, "utf8"))
}

if (!config || typeof config !== "object") {
  throw new Error(`${hooksFile} must contain a JSON object.`)
}

config.version = config.version ?? 1
config.hooks = config.hooks && typeof config.hooks === "object" ? config.hooks : {}

const existingStop = Array.isArray(config.hooks.stop) ? config.hooks.stop : []
const filteredStop = existingStop.filter((entry) => {
  const value = entry && typeof entry === "object" ? String(entry.command ?? "") : ""
  return !value.includes("evaluate-goal")
})

config.hooks.stop = [
  {
    command,
    loop_limit: null,
    timeout: 120,
  },
  ...filteredStop,
]

fs.mkdirSync(path.dirname(hooksFile), { recursive: true })
fs.writeFileSync(hooksFile, `${JSON.stringify(config, null, 2)}\n`, "utf8")
NODE

echo "Installed cursor-goal stop hook to ${HOOKS_FILE}"
echo "Hook command: ${EVALUATE_GOAL_SCRIPT}"
