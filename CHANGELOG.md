# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Cursor stop-hook enforcement: `cursor-goal stop-evaluate` reads the Cursor stop-hook JSON, re-runs verification for the linked goal, and blocks turn-end with a `followup_message` until verification passes or the turn budget is reached.
- Conversation linking via `--conversation-id` / `--workspace-root` on `set`, `resume`, and `edit`, backed by a hashed conversation index under the user state directory.
- `cursor-goal list [--json]` for completed goals across workspaces.
- `cursor-goal-install-hook` binary and `scripts/install-hook.sh` for installing the stop hook into `~/.cursor/hooks.json`.

### Fixed

- `edit --conversation-id` now re-links the conversation index (previously only `set` and `resume` did), so the stop hook tracks edited goals.
- Malformed stop-hook stdin now fails with a clear "must be valid JSON" error instead of a raw parse error.
- Checkpoint changed-file tracking now uses `git status --porcelain`, so staged and untracked files are recorded in run logs (previously only unstaged edits were).
- Home-directory redaction no longer redacts sibling paths that merely share the home prefix (for example `/home/user2` when home is `/home/user`).

## [0.3.2] - 2026-05-26

### Changed

- Clarified cleanup-release notes to avoid exposing internal planning labels in packaged docs.

## [0.3.1] - 2026-05-26

### Changed

- Clarified public README and install wording around the in-chat Cursor workflow.
- Removed planning-only notes from packaged docs.
- Dropped unused single-package pnpm workspace metadata.

## [0.3.0] - 2026-05-26

### Added

- Native Codex `/goal` parity harness covering single-file, multi-file, failing-checkpoint resume, already-complete, and fresh-process resume scenarios.
- Native parity documentation with the current evidence report and the observable contract used for comparison.
- Environment overrides for external state directories: `CURSOR_GOAL_STATE_DIR` and legacy workspace scope via `CURSOR_GOAL_STATE_SCOPE=workspace`.

### Changed

- Default goal state now lives outside the workspace under the user state directory for native Codex parity, instead of creating workspace `.goal/` files by default.
- `/goal resume` preserves existing goal settings unless the user explicitly supplies override flags.
- README, install, smoke-test, publishing, security, and issue-template docs now describe the external-state default.

## [0.2.3] - 2026-05-23

### Fixed

- `cursor-goal-install-skill` resolves the skill from the npm package when the bin is a symlink under `bin/` (fixes global install on macOS and custom npm prefixes)

## [0.2.2] - 2026-05-23

### Added

- `cursor-goal-install-skill` npm binary for global and project skill installs
- [`docs/install.md`](docs/install.md) with npm, source, and troubleshooting paths
- `CHANGELOG.md` for release notes

### Changed

- README and publishing docs: npm-first install, skill install after `npm i -g`
- npm package `files` now includes `scripts/` so install helpers ship with the tarball
- CONTRIBUTING, smoke-test, and examples cross-link install documentation

## [0.2.1] - 2026-05-22

### Added

- npm publish workflow (OIDC) and publishing guide
- Model label helper folded into checkpoint audit trail
- Stricter persisted state validation and fail-closed checkpoint policy

### Changed

- Launch documentation and README polish

## [0.2.0] - 2026-05-22

### Added

- Initial public release: Codex-style `/goal` loop for Cursor Agent chat
- CLI for `.goal/` state, verification, and checkpoints
- Goal skill for the in-chat loop
