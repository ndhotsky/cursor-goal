# Smoke verification

Zero-token proof that the `cursor-goal` CLI lifecycle and checkpoint behavior work locally.

## Prerequisites

CLI on PATH from either:

```bash
npm install -g cursor-goal
```

or a source checkout with `npm link` after `npm run build`.

Skill install is **not** required for `npm test` (CLI-only). For manual `/goal` in Cursor, install the skill first — see [`install.md`](install.md).

## Default

```bash
npm test
```

| Test | What it proves |
|------|----------------|
| `test/smoke.test.ts` | CLI set/status/pause/clear lifecycle |
| `test/smoke.test.ts` | `recordCheckpoint()` with real shell verification |
| `test/smoke.test.ts` | `cursor-goal checkpoint` via stdin |
| `test/loopPolicy.test.ts` | Completion vs validation vs spin-loop blocking |
| parser/args/validation tests | Codex-style parsing and safety |

## CLI live smoke (no Cursor UI)

Automated E2E in a temp directory: set goal → create artifact → `checkpoint` CONTINUE → `checkpoint` COMPLETE → verify `status: complete`. Same flow as the manual steps below, runnable via `tsx src/index.ts`.

## Manual `/goal` proof in Cursor

1. Install skill: `cursor-goal-install-skill --global` (or `npm run install-skill:global` from clone).
2. In Agent chat:

```text
/goal Create live-smoke.txt containing ok. Verify with: test -f live-smoke.txt && grep -qx ok live-smoke.txt
```

3. After the agent finishes, confirm:

```bash
cursor-goal
cursor-goal --json
```

Uses your Cursor subscription.

## Stop hook manual test (local IDE)

Requires global skill + hook (`cursor-goal-install-skill --global`, `cursor-goal-install-hook --global`) and **local** Agent chat (not Cloud Agents).

1. In a repo with a failing test, set a linked goal from the project root (use your chat id if known):

```bash
cursor-goal "Fix the failing test" --verify "npm test" \
  --conversation-id "<your-chat-id>" \
  --workspace-root "$PWD"
```

2. In Agent chat: `/goal Fix the failing test; verify with npm test`
3. Let the agent try to stop while tests still fail — the hook should auto-continue with a `followup_message`.
4. After the fix lands and `npm test` passes, the next turn end should allow stop and `cursor-goal` should show `complete`.
5. In a normal chat with no active goal, turn end should not loop (hook returns `{}`).
