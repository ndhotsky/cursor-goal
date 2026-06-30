# Smoke verification

Zero-token proof that the `cursor-goal` CLI lifecycle and checkpoint behavior work locally.

## Prerequisites

CLI on PATH from a source checkout:

```bash
git clone https://github.com/ndhotsky/cursor-goal.git
cd cursor-goal
npm install
npm run build
npm link
```

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
| `test/stopEvaluate.test.ts` | Stop hook evaluator paths |
| `test/install-hook.test.sh` | Hook installer merge behavior |
| parser/args/validation tests | Codex-style parsing and safety |

## CLI live smoke (no Cursor UI)

Automated E2E in a temp directory: set goal → create artifact → `checkpoint` CONTINUE → `checkpoint` COMPLETE → verify `status: complete`. Same flow as the manual steps below, runnable via `tsx src/index.ts`.

## Manual `/goal` proof in Cursor

1. From your clone: `npm run install-skill:global` (and `npm run install-hook:global` for hard enforcement).
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

Requires global skill + hook (`npm run install-skill:global`, `npm run install-hook:global`) and **local** Agent chat (not Cloud Agents).

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
