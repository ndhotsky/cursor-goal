#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${ROOT}/scripts/install-hook.sh"
EVALUATE="${ROOT}/scripts/evaluate-goal.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PKG="${TMP}/lib/node_modules/cursor-goal"
BIN="${TMP}/bin"
mkdir -p "${PKG}/scripts" "${BIN}"
cp "${SCRIPT}" "${PKG}/scripts/install-hook.sh"
cp "${EVALUATE}" "${PKG}/scripts/evaluate-goal.sh"
chmod +x "${PKG}/scripts/install-hook.sh" "${PKG}/scripts/evaluate-goal.sh"
ln -sf "../lib/node_modules/cursor-goal/scripts/install-hook.sh" "${BIN}/cursor-goal-install-hook"

HOME="${TMP}/home"
export HOME
mkdir -p "${HOME}/.cursor"
cat > "${HOME}/.cursor/hooks.json" <<'EOF'
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "echo session"
      }
    ]
  }
}
EOF

"${BIN}/cursor-goal-install-hook" --global

test -f "${HOME}/.cursor/hooks.json"
node - "${HOME}/.cursor/hooks.json" "${PKG}/scripts/evaluate-goal.sh" <<'NODE'
const fs = require("node:fs")

const [, , hooksFile, expectedCommand] = process.argv
const config = JSON.parse(fs.readFileSync(hooksFile, "utf8"))

if (!Array.isArray(config.hooks?.stop) || config.hooks.stop.length === 0) {
  throw new Error("expected stop hook entry")
}

const entry = config.hooks.stop[0]
if (entry.command !== expectedCommand) {
  throw new Error(`unexpected hook command: ${entry.command}`)
}
if (entry.loop_limit !== null) {
  throw new Error("expected loop_limit null")
}
if (entry.timeout !== 120) {
  throw new Error("expected timeout 120")
}

if (!Array.isArray(config.hooks.sessionStart) || config.hooks.sessionStart.length !== 1) {
  throw new Error("expected existing sessionStart hook to be preserved")
}
NODE

echo "ok: install-hook merges stop hook and preserves existing hooks"
