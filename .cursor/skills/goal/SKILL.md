---
name: goal
description: Run or manage a Codex-style persistent goal loop for long-running Cursor Agent work using cursor-goal, Cursor SDK, and Composer 2.5. Use for /goal, /goal pause, /goal resume, /goal clear, /goal edit, durable objectives, verification loops, and evidence-based completion.
disable-model-invocation: true
---

# Goal Skill

Use this skill when the user explicitly invokes `/goal` or asks for a persistent Codex-style goal loop.

This skill delegates to the local `cursor-goal` CLI. It is intentionally user-invoked only because it can run long agent loops and shell verification commands.

## Command mapping

Interpret the user's slash command like Codex Goal mode:

- `/goal` → show current status with `cursor-goal`.
- `/goal <objective>` → set or replace the active goal and start the loop.
- `/goal pause` → `cursor-goal pause`.
- `/goal resume` → `cursor-goal resume`.
- `/goal clear` → `cursor-goal clear`.
- `/goal edit <objective>` → `cursor-goal edit "<objective>"`.

If the objective names a verification command, pass it with `--verify`. Examples:

```bash
cursor-goal "Make the auth test suite pass without changing public API behavior" --verify "npm test -- auth"
cursor-goal "Migrate callbacks to async/await while keeping tests and typecheck green" --verify "npm test && npm run typecheck"
```

If no verification command is named, infer a safe one from the repository when obvious:

- Node package with `test` script: `npm test`, `pnpm test`, or `yarn test` according to the detected lockfile.
- TypeScript package with `typecheck` script: include the typecheck command.
- Python project with pytest configured: `pytest`.

If no safe verification command is obvious, run without `--verify` and ensure the goal text includes a concrete artifact or evidence standard.

## Goal quality

A strong goal should include:

1. Desired end state.
2. Verification surface: command, artifact, benchmark, report, or concrete evidence.
3. Constraints that must not regress.
4. Boundaries: files, tools, or systems allowed.
5. Iteration policy: how to pick the next action after each checkpoint.
6. Blocked stop condition: when to stop and report what is needed.

When the user's objective is too vague, first draft a better goal in one short paragraph, then run it unless an important destructive/ambiguous choice requires the user's input.

## Safety

- Never run an unbounded goal. Use the CLI default budget or pass `--max-turns`.
- Do not run destructive verification commands unless the user explicitly requested them and passed `--allow-destructive`.
- Do not expose `CURSOR_API_KEY` or any secret.
- Do not clear, pause, resume, or edit a goal unless the user asked for that lifecycle action.
- If the goal is blocked by missing credentials, unavailable services, or ambiguous destructive changes, stop and report the blocker.

## Default model

Use Composer 2.5 unless the user requested a different model:

```bash
cursor-goal "<objective>" --model composer-2.5
```

The CLI resolves the exact model through Cursor's model catalog.
