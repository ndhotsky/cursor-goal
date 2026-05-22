import type {
  CheckpointOutcome,
  GoalState,
  PostCheckpointOptions,
  ValidationResult,
} from "./types.js"
import { addHistory, setGoalStatus } from "./state.js"

export function budgetStopReason(state: GoalState) {
  if (state.usage.turnsUsed >= state.budgets.maxTurns) {
    return `Turn budget reached (${state.usage.turnsUsed}/${state.budgets.maxTurns}).`
  }

  return undefined
}

function verificationAllowsCompletion(validation: ValidationResult) {
  return validation.ok || validation.skipped
}

export function applyCheckpointOutcome(
  state: GoalState,
  outcome: CheckpointOutcome,
  validation: ValidationResult,
  options: PostCheckpointOptions
) {
  const verificationOk = verificationAllowsCompletion(validation)

  if (outcome.decision.status === "complete" && verificationOk) {
    setGoalStatus(state, "complete", outcome.decision.reason)
    return
  }

  if (outcome.decision.status === "complete" && !verificationOk) {
    addHistory(state, "completion_rejected_by_validation", {
      reason: outcome.decision.reason,
      exitCode: validation.exitCode,
    })
    state.last.reason = "Model reported completion, but verification failed; continuing while budget remains."
    if (options.once) {
      setGoalStatus(state, "paused", "--once completed one checkpoint and paused before automatic continuation.")
    }
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

  finalizeActiveCheckpoint(state, options)
}

function finalizeActiveCheckpoint(state: GoalState, options: PostCheckpointOptions) {
  if (state.status !== "active") return

  if (options.once) {
    setGoalStatus(state, "paused", "--once completed one checkpoint and paused before automatic continuation.")
    return
  }

  addHistory(state, "goal_continues", {
    reason: state.last.decision?.reason,
    validationOk: state.last.validation?.ok,
    validationSkipped: state.last.validation?.skipped,
  })
}
