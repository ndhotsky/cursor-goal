---
name: goal
description: Run or manage a Codex-style persistent goal loop in Cursor Agent chat using cursor-goal checkpoint helpers. Use for /goal, /goal pause, /goal resume, /goal clear, /goal edit, durable objectives, verification loops, and evidence-based completion.
disable-model-invocation: true
---

# Goal Skill

Install from source (see repo `docs/install.md`):

```bash
git clone https://github.com/ndhotsky/cursor-goal.git
cd cursor-goal && npm install && npm run build && npm link
test -f dist/index.js
cursor-goal-install-skill --global
cursor-goal-install-hook --global
```

Use this skill when the user invokes `/goal` or asks for a Codex-style persistent goal loop.

**Run the loop in this Cursor chat session.** You are the agent. Do not start a separate agent process or move the loop outside this chat.

Use the local `cursor-goal` CLI only for durable state, verification, and checkpoint accounting.

When the global stop hook is installed (`cursor-goal-install-hook --global`) in local Cursor Agent chat, **you are not done until the hook allows stop**. Turn-end verification is authoritative; do not declare completion yourself. Checkpoints below are still useful for audit, but the stop hook is the hard gate. Cloud Agent sessions still get skill + CLI behavior without local stop-hook enforcement.

## Command mapping

- `/goal` → `cursor-goal` (status).
- `/goal <objective>` → set state, then work the goal in this chat.
- `/goal pause` → `cursor-goal pause`.
- `/goal resume` → `cursor-goal resume`, then continue in this chat.
- `/goal clear` → `cursor-goal clear`.
- `/goal edit <objective>` → `cursor-goal edit "<objective>"`, then continue.

When setting a goal from the CLI surface:

```bash
cursor-goal "<objective>" --verify "npm test" \
  --conversation-id "<chat-id-if-known>" \
  --workspace-root "<project-root>"
```

Pass `--conversation-id` when you know the active Cursor chat id (for example `CURSOR_CONVERSATION_ID` when present in the environment). If that env var is unavailable, ask for or otherwise pass/link the active chat id explicitly. This links goal state to the chat so the stop hook can enforce completion; otherwise the hook no-ops. Pass `--workspace-root` when the project root differs from the shell cwd.

If the objective names verification ("verify with …", "verified by …"), pass `--verify`. Otherwise infer a safe command from the repo when obvious (`npm test`, `pnpm test`, `pytest`, etc.).

## Checkpoint loop (each turn)

When a stop hook is installed, treat checkpoints as **audit progress**, not the primary stop gate. Still record them when you make meaningful progress.

1. Load active goal with `cursor-goal`. If missing on `/goal <objective>`, set it with `cursor-goal` (include `--conversation-id` / `--workspace-root` when available).
2. If status is not `active`, report status and stop unless the user asked to resume.
3. Optionally run `cursor-goal prompt` when you need the formatted continuation contract.
4. Make **one bounded checkpoint** of concrete progress with normal Cursor tools.
5. End your assistant message with exactly:

```text
GOAL_STATUS: COMPLETE | CONTINUE | BLOCKED
GOAL_REASON: <one short evidence-based sentence>
```

6. Record the checkpoint:

```bash
cursor-goal checkpoint --tool-calls <n>
```

Pipe your final assistant text on stdin when needed:

```bash
cursor-goal checkpoint --tool-calls 3 <<'EOF'
<summary of work>
GOAL_STATUS: CONTINUE
GOAL_REASON: tests still failing on auth module
EOF
```

7. Read the printed status. If still `active`, continue in follow-up turns until `complete`, `blocked`, `budget_limited`, or the user pauses.

Optional: pass `--once` on checkpoint to pause after one checkpoint when still active (useful for single-step handoffs). This does not reduce `maxTurns`.

## Operating contract

For the full continuation contract (same text `cursor-goal prompt` prints), run `cursor-goal prompt` when you need the canonical wording.

- Treat the goal text as both the starting prompt and the completion criteria.
- Prefer small, auditable changes over sweeping rewrites.
- Use repository evidence: files, diffs, tests, command output, artifacts.
- Do not declare complete unless verification passed or you justify why it no longer applies. With the stop hook installed, the hook decides completion at turn end even if you emit `GOAL_STATUS: COMPLETE`.
- If blocked by missing credentials, destructive ambiguity, or unavailable verification, use `GOAL_STATUS: BLOCKED`.
- Do not pause, resume, clear, or edit unless the user asked for that lifecycle action.
- Default to at most 8 checkpoints unless the user set a different budget in state.
- `--once` on `cursor-goal checkpoint` pauses after that checkpoint if the goal is still `active`; it does **not** change the turn budget.
- `--tier` is recorded for audit only; the model you pick in Cursor chat is what runs.
- Default state is stored outside the workspace for native Codex parity. Use `--state-dir .goal` or `CURSOR_GOAL_STATE_SCOPE=workspace` only when the user explicitly wants legacy workspace-local state.

## Goal quality

A strong goal includes: end state, verification surface, constraints, boundaries, iteration policy, and blocked stop condition.

When the objective is too vague, draft a better goal in one short paragraph, then proceed unless a destructive/ambiguous choice needs user input.

## Safety

- Do not run destructive verification unless the user explicitly requested it and state allows it.
- Do not expose secrets.
- Stop-hook logs record `conversation_id`, `generation_id`, and transcript path presence/home-redacted path only; they do not read transcript contents.
- If blocked, stop and report what input is needed.
