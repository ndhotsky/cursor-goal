import type { AgentCheckpointResult, GoalState, ParsedCli, ValidationResult } from "./types.js"
import { addHistory, setGoalStatus } from "./state.js"

export function budgetStopReason(state: GoalState) {
  if (state.usage.turnsUsed >= state.budgets.maxTurns) {
    return `Turn budget reached (${state.usage.turnsUsed}/${state.budgets.maxTurns}).`
  }

  const usedTokens = state.usage.inputTokens + state.usage.outputTokens
  if (usedTokens >= state.budgets.tokenBudget) {
    return `Token budget reached (${usedTokens}/${state.budgets.tokenBudget}).`
  }

  if (state.budgets.timeBudgetMs && state.usage.timeUsedMs >= state.budgets.timeBudgetMs) {
    return `Time budget reached (${state.usage.timeUsedMs}/${state.budgets.timeBudgetMs}ms).`
  }

  return undefined
}

export function decideNextState(
  state: GoalState,
  checkpoint: AgentCheckpointResult,
  validation: ValidationResult,
  command: ParsedCli
) {
  const verificationOk = validation.ok || validation.skipped

  if (checkpoint.decision.status === "complete" && verificationOk) {
    setGoalStatus(state, "complete", checkpoint.decision.reason)
    return
  }

  if (checkpoint.decision.status === "complete" && !verificationOk) {
    addHistory(state, "completion_rejected_by_validation", {
      reason: checkpoint.decision.reason,
      exitCode: validation.exitCode,
    })
    state.last.reason = "Model reported completion, but verification failed; continuing while budget remains."
    return
  }

  if (checkpoint.decision.status === "blocked") {
    setGoalStatus(state, "blocked", checkpoint.decision.reason)
    return
  }

  if (!validation.ok && checkpoint.toolCallCount === 0) {
    setGoalStatus(
      state,
      "blocked",
      "Verification failed and the checkpoint made no tool calls; suppressed continuation to avoid a spin loop."
    )
    return
  }

  if (command.once) return

  addHistory(state, "goal_continues", {
    reason: checkpoint.decision.reason,
    validationOk: validation.ok,
    validationSkipped: validation.skipped,
  })
}
