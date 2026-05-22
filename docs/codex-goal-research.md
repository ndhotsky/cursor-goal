# Codex `/goal` research notes

This project is intentionally shaped around the public Codex Goal-mode contract rather than a generic “while tests fail, keep prompting” loop.

## Public behavior

OpenAI’s Codex CLI docs describe the command surface as:

```text
/goal <objective>
/goal
/goal pause
/goal resume
/goal clear
```

The objective must be non-empty and no longer than 4,000 characters; longer instructions should live in a file that the goal references.

The Codex app docs also expose goal controls above the composer, including pause, resume, edit, and clear. They recommend using `/plan` before `/goal` when the goal needs shaping.

## Goal writing contract

The strongest Codex goals define:

1. Outcome
2. Verification surface
3. Constraints
4. Boundaries
5. Iteration policy
6. Blocked stop condition

This project’s continuation prompt mirrors that structure. The CLI keeps `--verify` separate for convenience, but the objective text should still describe what counts as done.

## Architecture ideas copied

Codex’s public docs describe Goals as durable thread-scoped state. The state includes objective, lifecycle, budget, and progress accounting. A Goal can be active, paused, complete, or budget-limited. The model is expected to complete only after checking concrete evidence.

This project copies those ideas as local workspace state:

```text
.goal/current.json
.goal/runs/<timestamp>-<slug>.md
```

The lifecycle statuses are:

```text
active
paused
complete
blocked
budget_limited
```

## Continuation policy

Codex continuation is conservative: it happens at safe boundaries when the thread is idle, not while another turn is active, not while user input is queued, and not in plan-only mode. Public docs also describe suppression when a continuation turn makes no tool call, to avoid spinning.

Cursor SDK does not expose the same event-driven thread goal primitive, so `cursor-goal` approximates this with:

- one checkpoint per SDK run;
- external verification after each checkpoint;
- state persistence after each checkpoint;
- max-turn, token, time, and idle budgets;
- continuation suppression if validation fails and no tool call occurred.

## Model authority boundary

Codex docs describe an intentional separation: the model can work toward a goal and mark it complete when evidence supports it, but user/system controls lifecycle transitions like pause, resume, clear, and budget limits.

`cursor-goal` copies this by letting the model emit only:

```text
GOAL_STATUS: COMPLETE | CONTINUE | BLOCKED
GOAL_REASON: <reason>
```

The CLI, not the model, decides whether to accept completion. If a verification command exists and fails, the runner rejects `COMPLETE` and continues while budget remains.

## Cursor-specific mapping

Cursor’s SDK exposes programmatic agents with `Agent.create`, local and cloud runtimes, model selection, and streamed events. Cursor’s public SDK examples also use `Cursor.models.list()` to discover model choices. This project defaults to `composer-2.5` and then resolves available models through the SDK.

Composer 2.5 is a good default because Cursor describes it as better at sustained long-running work and complex instruction following than Composer 2.

## Sources

- OpenAI Codex use case: Follow a goal — https://developers.openai.com/codex/use-cases/follow-goals
- OpenAI Codex CLI slash commands — https://developers.openai.com/codex/cli/slash-commands
- OpenAI Cookbook: Using Goals in Codex — https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
- OpenAI Codex app commands — https://developers.openai.com/codex/app/commands
- OpenAI Codex prompting: Goal mode — https://developers.openai.com/codex/prompting
- OpenAI Codex app-server goal state — https://developers.openai.com/codex/app-server
- Cursor SDK announcement — https://cursor.com/blog/typescript-sdk
- Cursor Composer 2.5 announcement — https://cursor.com/blog/composer-2-5
- Cursor cookbook SDK examples — https://github.com/cursor/cookbook
