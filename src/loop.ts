import type { ModelSelection } from "@cursor/sdk"
import { GoalAgent } from "./agent.js"
import { buildContinuationPrompt } from "./prompt.js"
import {
  addHistory,
  appendRunLog,
  saveGoalState,
  setGoalStatus,
  validationMarkdown,
} from "./state.js"
import type { AgentCheckpointResult, GoalState, ParsedCli, ValidationResult } from "./types.js"
import { listGitChangedFiles, runValidation } from "./validation.js"

export async function runGoalLoop(options: {
  apiKey: string
  stateDir: string
  state: GoalState
  command: ParsedCli
}) {
  const { state, command } = options
  const model = state.modelResolved?.selection as ModelSelection | undefined
  if (!model) throw new Error("Goal state has no resolved model. Resolve a model before running the loop.")

  const agent = await GoalAgent.create({ apiKey: options.apiKey, cwd: state.cwd, model })
  let previousValidation = state.last.validation

  try {
    while (state.status === "active") {
      const budgetReason = budgetStopReason(state)
      if (budgetReason) {
        setGoalStatus(state, "budget_limited", budgetReason)
        await appendRunLog(state, `## Budget limited\n\n${budgetReason}`)
        break
      }

      const checkpointNo = state.usage.turnsUsed + 1
      console.log(`\n\n=== Goal checkpoint ${checkpointNo}/${state.budgets.maxTurns} ===\n`)
      await appendRunLog(state, `## Checkpoint ${checkpointNo}\n\nStarted: ${new Date().toISOString()}`)

      const prompt = buildContinuationPrompt(state, previousValidation)
      const checkpoint = await agent.checkpoint({
        prompt,
        idleTimeoutMs: state.budgets.idleTimeoutMs,
        showThinking: command.showThinking,
      })

      applyCheckpointUsage(state, checkpoint)
      state.last.decision = checkpoint.decision
      state.last.toolCallCount = checkpoint.toolCallCount
      state.last.assistantTail = tail(checkpoint.assistantText)

      console.log(`\n\n[goal decision] ${checkpoint.decision.status}: ${checkpoint.decision.reason}`)

      const validation = await runValidation({
        command: state.verification.command,
        cwd: state.cwd,
        timeoutMs: state.verification.timeoutMs,
        allowDestructive: state.verification.allowDestructive,
      })
      previousValidation = validation
      state.last.validation = validation
      state.last.filesChanged = listGitChangedFiles(state.cwd)

      await appendRunLog(
        state,
        [
          `Assistant status: **${checkpoint.decision.status}**`,
          `Reason: ${checkpoint.decision.reason}`,
          `Tool calls observed: ${checkpoint.toolCallCount}`,
          `SDK run status: ${checkpoint.status}`,
          `Duration: ${checkpoint.durationMs}ms`,
          "",
          validationMarkdown(validation),
          "",
          state.last.filesChanged.length ? `Changed files:\n${state.last.filesChanged.map((file) => `- ${file}`).join("\n")}` : "Changed files: none recorded",
        ].join("\n")
      )

      decideNextState(state, checkpoint, validation, command)
      await saveGoalState(options.stateDir, state)

      if (command.once && state.status === "active") {
        setGoalStatus(state, "paused", "--once completed one checkpoint and paused before automatic continuation.")
        await saveGoalState(options.stateDir, state)
        break
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setGoalStatus(state, "blocked", message)
    addHistory(state, "loop_error", { message })
    await appendRunLog(state, `## Error\n\n${message}`)
    await saveGoalState(options.stateDir, state)
    throw error
  } finally {
    await agent.dispose()
  }

  return state
}

function applyCheckpointUsage(state: GoalState, checkpoint: AgentCheckpointResult) {
  state.usage.turnsUsed += 1
  state.usage.inputTokens += checkpoint.usage.inputTokens ?? 0
  state.usage.outputTokens += checkpoint.usage.outputTokens ?? 0
  state.usage.timeUsedMs += checkpoint.durationMs
}

function decideNextState(state: GoalState, checkpoint: AgentCheckpointResult, validation: ValidationResult, command: ParsedCli) {
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
    setGoalStatus(state, "blocked", "Verification failed and the checkpoint made no tool calls; suppressed continuation to avoid a spin loop.")
    return
  }

  if (command.once) return

  addHistory(state, "goal_continues", {
    reason: checkpoint.decision.reason,
    validationOk: validation.ok,
    validationSkipped: validation.skipped,
  })
}

function budgetStopReason(state: GoalState) {
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

function tail(value: string, max = 4000) {
  return value.length <= max ? value : value.slice(value.length - max)
}
