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

find_cli_entry() {
  local script_dir candidate

  script_dir="$(real_dir_of "$0")"
  candidate="${script_dir}/../dist/index.js"
  if [[ -f "${candidate}" ]]; then
    echo "${candidate}"
    return 0
  fi

  if command -v npm >/dev/null 2>&1; then
    local global_root local_root
    global_root="$(npm root -g 2>/dev/null || true)"
    if [[ -n "${global_root}" ]]; then
      candidate="${global_root}/cursor-goal/dist/index.js"
      if [[ -f "${candidate}" ]]; then
        echo "${candidate}"
        return 0
      fi
    fi

    local_root="$(npm root 2>/dev/null || true)"
    if [[ -n "${local_root}" ]]; then
      candidate="${local_root}/cursor-goal/dist/index.js"
      if [[ -f "${candidate}" ]]; then
        echo "${candidate}"
        return 0
      fi
    fi
  fi

  echo "error: could not find cursor-goal CLI entry (expected dist/index.js)" >&2
  echo "hint: run npm run build && npm link from your cursor-goal clone" >&2
  return 1
}

CLI_ENTRY="$(find_cli_entry)"
exec node "$CLI_ENTRY" stop-evaluate
