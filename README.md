# cursor-goal

A Codex-style `/goal` loop for Cursor SDK agents, optimized for **Composer 2.5**.

`cursor-goal` gives Cursor users a persistent, bounded objective loop that feels closer to OpenAI Codex Goal mode: set one durable objective, let the agent make checkpointed progress, verify evidence, and keep going until the goal is complete, paused, blocked, or budget-limited.

It is not a fork of Codex and it does not add native Goal state to Cursor itself. It is a small open-source harness around `@cursor/sdk` plus a Cursor Skill you can invoke as `/goal`.

## What it copies from Codex Goal mode

- `/goal <objective>` sets or replaces the active goal.
- `/goal` / `cursor-goal` shows the current goal.
- `/goal pause`, `/goal resume`, `/goal clear`, and `/goal edit` manage lifecycle.
- Goal text is treated as both the starting prompt and the completion criteria.
- The runner stores durable local goal state in `.goal/current.json`.
- The runner writes an audit log in `.goal/runs/*.md`.
- Each continuation asks for one bounded checkpoint, then performs a completion audit.
- Verification output, changed files, model decision, and usage accounting are recorded.
- It suppresses pointless continuation when a checkpoint made no tool calls and validation still failed.
- It stops at explicit turn, token, idle, and optional wall-clock budgets.

## Requirements

- Node.js 22+
- A Cursor API key in `CURSOR_API_KEY`
- A Cursor account/model catalog with access to Composer 2.5 or another requested model

## Install locally

```bash
git clone https://github.com/Niko96-dotcom/cursor-goal.git
cd cursor-goal
npm install
npm run build
npm link
```

Then from any repo:

```bash
export CURSOR_API_KEY="crsr_..."
cursor-goal "Make the auth test suite pass without changing public API behavior" \
  --verify "npm test -- auth" \
  --max-turns 8
```

The default model is `composer-2.5`. The resolver calls `Cursor.models.list()` and falls back by display name if the exact id differs in your account.

## Commands

```bash
cursor-goal
cursor-goal "<objective>" --verify "npm test"
cursor-goal pause
cursor-goal resume
cursor-goal clear
cursor-goal edit "<new objective>"
```

The CLI follows Codex’s compact surface: a bare objective sets/replaces the goal, while no argument displays status.

## Options

```text
-v, --verify <cmd>              Verification command. Repeatable; joined with &&.
    --validate <cmd>            Alias for --verify.
    --model <id>                Default: composer-2.5 or CURSOR_GOAL_MODEL.
    --tier auto|fast|standard   Prefer a Cursor model variant when exposed by the SDK.
    --max-turns <n>             Continuation budget. Default: 8.
    --token-budget <n>          Soft token budget. Default: 50000.
    --time-budget-ms <n>        Optional wall-clock budget.
    --idle-timeout-ms <n>       Stop if no stream event arrives. Default: 300000.
    --validation-timeout-ms <n> Timeout for verification command. Default: 300000.
    --allow-destructive         Permit dangerous shell patterns in verification.
    --once                      Run one checkpoint, then pause if not complete.
    --no-continue               Set/edit state but do not start the loop.
    --json                      Print machine-readable status.
    --state-dir <path>          Default: <cwd>/.goal.
```

## Use as `/goal` inside Cursor

This repo already ships the skill at `.cursor/skills/goal/SKILL.md`, so `/goal` works when this workspace is open.

For other projects, install the skill once:

```bash
# project-local (checked into that repo)
npm run install-skill -- /path/to/project

# or global (available in every workspace)
npm run install-skill:global
```

Make sure `cursor-goal` is on your PATH (`npm link` from this repo, or `npm install -g cursor-goal` after publishing).

Then in Cursor Agent chat:

```text
/goal Make the auth test suite pass without changing public API behavior. Verify with npm test -- auth.
```

The Skill instructs Cursor’s agent to translate the user’s slash command into the local CLI call.

## Strong goal pattern

```text
/goal <desired end state>, verified by <specific command or artifact>, while preserving <constraints>. Use <allowed files/tools>. Between checkpoints, record what changed, what evidence was checked, and the next best action. If blocked, stop with the blocker and the input needed.
```

Example:

```bash
cursor-goal "Reduce p95 checkout latency below 120 ms, verified by npm run bench:checkout, while keeping npm test green. Limit changes to checkout service code and benchmark fixtures. If the benchmark cannot run, stop with the blocker and the next input needed." \
  --verify "npm run bench:checkout && npm test" \
  --max-turns 12
```

## How it works

1. Resolves the requested Cursor model, defaulting to Composer 2.5.
2. Creates one local Cursor SDK Agent for the active process.
3. Sends a continuation prompt that keeps the active goal, verification surface, prior evidence, and lifecycle rules visible.
4. Streams assistant/tool/status events to the terminal.
5. Runs the verification command outside the model.
6. Records validation, changed files, model decision, usage, and status in `.goal/`.
7. Continues only when the goal remains active, budget remains, and the last checkpoint did useful work.

## Safety defaults

The runner refuses obviously destructive verification commands unless `--allow-destructive` is provided. It also pauses on SIGINT/SIGTERM, times out quiet streams, and records a dirty working tree at the start of each goal.

## Known limitations

Cursor’s SDK does not currently expose Codex’s exact thread-goal API. This project approximates the lifecycle with workspace-local `.goal/` state and a single SDK agent during a running process. `resume` reconstructs context from the goal state and log rather than resurrecting an identical hidden model thread.

For long-running unattended work, prefer a verification command and a small turn budget. Little raccoon agents get weird when “done” is vibes-only.

## Research notes

See [`docs/codex-goal-research.md`](docs/codex-goal-research.md) for the Codex `/goal` design points this project mirrors.

## License

MIT
