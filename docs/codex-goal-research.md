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

This project copies those ideas as local state outside the workspace by default:

```text
$XDG_STATE_HOME/cursor-goal/workspaces/<workspace-hash>/current.json
$XDG_STATE_HOME/cursor-goal/workspaces/<workspace-hash>/runs/<timestamp>-<slug>.md
```

Legacy workspace-local state remains available with `--state-dir .goal` or `CURSOR_GOAL_STATE_SCOPE=workspace`.

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

`cursor-goal` does not run an in-process agent loop. The goal loop runs in **Cursor Agent chat**; the CLI handles durable state and checkpoint accounting:

- one bounded checkpoint per agent turn in chat;
- shell verification after each checkpoint (when configured);
- state persistence after each checkpoint;
- max-turn budget in goal state;
- continuation suppression if validation fails and the checkpoint recorded zero tool calls.

## Model authority boundary

Codex docs describe an intentional separation: the model can work toward a goal and mark it complete when evidence supports it, but user/system controls lifecycle transitions like pause, resume, clear, and budget limits.

`cursor-goal` copies this by letting the model emit only:

```text
GOAL_STATUS: COMPLETE | CONTINUE | BLOCKED
GOAL_REASON: <reason>
```

The CLI, not the model, decides whether to accept completion. If a verification command exists and fails, the runner rejects `COMPLETE` and continues while budget remains.

## Cursor-specific mapping

The agent loop runs in the user’s Cursor chat session (Composer model selected in the IDE). `cursor-goal` is a small CLI that:

- writes and reads local state outside the workspace by default;
- runs configured verification commands;
- records checkpoints from assistant text (`GOAL_STATUS` / `GOAL_REASON`).

`--model` and `CURSOR_GOAL_MODEL` are recorded in state for audit; they do not spawn a separate SDK agent. `--tier` is audit-only metadata.

Composer 2.5 is the documented default because Cursor describes it as better at sustained long-running work and complex instruction following than Composer 2.

## Sources

- OpenAI Codex use case: Follow a goal — https://developers.openai.com/codex/use-cases/follow-goals
- OpenAI Codex CLI slash commands — https://developers.openai.com/codex/cli/slash-commands
- OpenAI Cookbook: Using Goals in Codex — https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
- OpenAI Codex app commands — https://developers.openai.com/codex/app/commands
- OpenAI Codex prompting: Goal mode — https://developers.openai.com/codex/prompting
- OpenAI Codex app-server goal state — https://developers.openai.com/codex/app-server
- Cursor Composer 2.5 announcement — https://cursor.com/blog/composer-2-5
