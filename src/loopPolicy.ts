import type {
  CheckpointOutcome,
  GoalState,
  PostCheckpointOptions,
  ValidationResult,
} from "./types.js"
import { addHistory, setGoalStatus } from "./state.js"

const ONCE_PAUSE_REASON =
  "--once completed one checkpoint and paused before automatic continuation."

export function budgetStopReason(state: GoalState) {
  if (state.usage.turnsUsed >= state.budgets.maxTurns) {
    return `Turn budget reached (${state.usage.turnsUsed}/${state.budgets.maxTurns}).`
  }

  return undefined
}

export function applyCheckpointOutcome(
  state: GoalState,
  outcome: CheckpointOutcome,
  validation: ValidationResult,
  options: PostCheckpointOptions
) {
  const verificationOk = validation.ok || validation.skipped

  if (outcome.decision.status === "complete" && verificationOk) {
    setGoalStatus(state, "complete", outcome.decision.reason)
    return
  }

  if (outcome.decision.status === "complete" && !verificationOk) {
    addHistory(state, "completion_rejected_by_validation", {
      reason: outcome.decision.reason,
      exitCode: validation.exitCode,
    })
    state.last.reason =
      "Model reported completion, but verification failed; continuing while budget remains."
    pauseIfOnce(state, options)
    return
  }

  if (outcome.decision.status === "blocked") {
    setGoalStatus(state, "blocked", outcome.decision.reason)
    return
  }

  if (!validation.ok && outcome.toolCallCount === 0) {
    setGoalStatus(
      state,
      "blocked",
      "Verification failed and the checkpoint made no tool calls; suppressed continuation to avoid a spin loop."
    )
    return
  }

  if (state.status !== "active") return

  if (!options.once) {
    addHistory(state, "goal_continues", {
      reason: outcome.decision.reason,
      validationOk: validation.ok,
      validationSkipped: validation.skipped,
    })
  }

  pauseIfOnce(state, options)
}

function pauseIfOnce(state: GoalState, options: PostCheckpointOptions) {
  if (state.status !== "active" || !options.once) return
  setGoalStatus(state, "paused", ONCE_PAUSE_REASON)
}
