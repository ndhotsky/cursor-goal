import type {
  CheckpointOutcome,
  GoalState,
  PostCheckpointOptions,
  ValidationResult,
} from "./types.js"
import { addHistory, setGoalStatus } from "./state.js"

const ONCE_PAUSE_REASON =
  "--once completed one checkpoint and paused before automatic continuation."

const COMPLETION_REJECTED_REASON =
  "Model reported completion, but verification failed; continuing while budget remains."

type CheckpointContext = {
  state: GoalState
  outcome: CheckpointOutcome
  validation: ValidationResult
  options: PostCheckpointOptions
}

type CheckpointRuleResult = "handled" | "continue"

type CheckpointRule = {
  name: string
  matches: (ctx: CheckpointContext) => boolean
  apply: (ctx: CheckpointContext) => CheckpointRuleResult
}

const CHECKPOINT_RULES: CheckpointRule[] = [
  {
    name: "complete_with_verification",
    matches: ({ outcome, validation }) =>
      outcome.decision.status === "complete" && verificationOk(validation),
    apply: ({ state, outcome }) => {
      setGoalStatus(state, "complete", outcome.decision.reason)
      return "handled"
    },
  },
  {
    name: "complete_rejected_by_validation",
    matches: ({ outcome, validation }) =>
      outcome.decision.status === "complete" && !verificationOk(validation),
    apply: (ctx) => {
      noteCompletionRejectedByValidation(ctx)
      finalizeActiveCheckpoint(ctx)
      return "handled"
    },
  },
  {
    name: "blocked_decision",
    matches: ({ outcome }) => outcome.decision.status === "blocked",
    apply: ({ state, outcome }) => {
      setGoalStatus(state, "blocked", outcome.decision.reason)
      return "handled"
    },
  },
  {
    name: "verification_failed_no_tool_calls",
    matches: ({ outcome, validation }) => !validation.ok && outcome.toolCallCount === 0,
    apply: ({ state }) => {
      setGoalStatus(
        state,
        "blocked",
        "Verification failed and the checkpoint made no tool calls; suppressed continuation to avoid a spin loop."
      )
      return "handled"
    },
  },
  {
    name: "active_continue",
    matches: ({ state }) => state.status === "active",
    apply: (ctx) => {
      finalizeActiveCheckpoint(ctx)
      return "handled"
    },
  },
]

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
  const ctx: CheckpointContext = { state, outcome, validation, options }

  for (const rule of CHECKPOINT_RULES) {
    if (!rule.matches(ctx)) continue
    if (rule.apply(ctx) === "handled") return
  }
}

function verificationOk(validation: ValidationResult) {
  return validation.ok || validation.skipped
}

function noteCompletionRejectedByValidation(ctx: CheckpointContext) {
  const { state, outcome, validation } = ctx
  addHistory(state, "completion_rejected_by_validation", {
    reason: outcome.decision.reason,
    exitCode: validation.exitCode,
  })
  state.last.reason = COMPLETION_REJECTED_REASON
}

function finalizeActiveCheckpoint(ctx: CheckpointContext) {
  const { state, outcome, validation, options } = ctx
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
