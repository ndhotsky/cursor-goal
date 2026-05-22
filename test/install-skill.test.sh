#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${ROOT}/scripts/install-skill.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Simulate npm global bin symlink (bin/name -> package/scripts/install-skill.sh)
PKG="${TMP}/lib/node_modules/cursor-goal"
BIN="${TMP}/bin"
mkdir -p "${PKG}/scripts" "${PKG}/.cursor/skills/goal" "${BIN}"
cp "${SCRIPT}" "${PKG}/scripts/install-skill.sh"
cp "${ROOT}/.cursor/skills/goal/SKILL.md" "${PKG}/.cursor/skills/goal/SKILL.md"
ln -sf "../lib/node_modules/cursor-goal/scripts/install-skill.sh" "${BIN}/cursor-goal-install-skill"

"${BIN}/cursor-goal-install-skill" "${TMP}"

test -f "${TMP}/.cursor/skills/goal/SKILL.md"
echo "ok: install-skill resolves through npm-style bin symlink"
