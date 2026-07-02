# Agent guidance for cursor-goal

This repository builds a small TypeScript CLI around local `.goal/` state for Codex-style `/goal` loops in Cursor Agent chat.

End-user install: `docs/install.md`. Releases: `docs/publishing.md`, `CHANGELOG.md`.

Rules:

- Keep dependencies minimal. Do not add agent-runtime SDK dependencies.
- The agent loop runs in Cursor chat on the user's subscription.
- The CLI manages state, verification, and checkpoint accounting only.
- Preserve the Codex-style command surface.
- Do not add telemetry.
- Do not log secrets.
- Treat verification as the source of truth when provided.
- Keep generated files out of source unless they are part of a release process.
- Prefer small, testable modules.

## Cursor Cloud specific instructions

- This is a Node 22+ TypeScript CLI with no long-running service; the agent loop itself runs in Cursor chat, so there is nothing to "serve" or keep alive here.
- Standard commands live in `package.json` scripts and `CONTRIBUTING.md`: `npm run dev` (run via `tsx`), `npm run build` (emit `dist/`), `npm test`, `npm run typecheck`.
- There is no lint script/ESLint config; `npm run typecheck` (`tsc --noEmit`) is the closest static check.
- By default the CLI persists state outside the workspace (`$XDG_STATE_HOME`/`~/.local/state/cursor-goal`). When testing lifecycle commands, set `CURSOR_GOAL_STATE_DIR=<tmp>` (or `CURSOR_GOAL_STATE_SCOPE=workspace`) to sandbox state and avoid touching the real user state dir.
- `npm test` also runs `test/install-skill.test.sh`, which needs `bash` on PATH (already present).
