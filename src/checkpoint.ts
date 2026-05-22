import { applyCheckpointOutcome, budgetStopReason } from "./loopPolicy.js"
import { tailText } from "./text.js"
import { buildContinuationPrompt } from "./prompt.js"
import {
  addHistory,
  appendRunLog,
  loadGoalState,
  saveGoalState,
  setGoalStatus,
  validationMarkdown,
} from "./state.js"
import { parseGoalDecision } from "./statusParser.js"
import type { GoalState, ParsedCli } from "./types.js"
import { listGitChangedFiles, runValidation } from "./validation.js"

export function continuationPromptForState(state: GoalState) {
  return buildContinuationPrompt(state, state.last.validation)
}

export async function recordCheckpoint(options: {
  stateDir: string
  command: ParsedCli
  assistantText: string
  toolCallCount?: number
}) {
  const state = await loadGoalState(options.stateDir)
  if (!state) throw new Error("No goal exists. Set one with /goal or cursor-goal \"<objective>\".")

  if (state.status !== "active") {
    throw new Error(`Goal is ${state.status}; only active goals accept checkpoints.`)
  }

  const budgetReason = budgetStopReason(state)
  if (budgetReason) {
    setGoalStatus(state, "budget_limited", budgetReason)
    await appendRunLog(state, `## Budget limited\n\n${budgetReason}`)
    await saveGoalState(options.stateDir, state)
    return state
  }

  const checkpointNo = state.usage.turnsUsed + 1
  await appendRunLog(state, `## Checkpoint ${checkpointNo}\n\nStarted: ${new Date().toISOString()}`)

  const decision = parseGoalDecision(options.assistantText)
  state.usage.turnsUsed += 1
  state.last.decision = decision
  state.last.toolCallCount = options.toolCallCount ?? 0
  state.last.assistantTail = tailText(options.assistantText, 4000)

  const validation = await runValidation({
    command: state.verification.command,
    cwd: state.cwd,
    timeoutMs: state.verification.timeoutMs,
    allowDestructive: state.verification.allowDestructive,
    echo: true,
  })
  state.last.validation = validation
  state.last.filesChanged = listGitChangedFiles(state.cwd)

  await appendRunLog(
    state,
    [
      `Assistant status: **${decision.status}**`,
      `Reason: ${decision.reason}`,
      `Tool calls observed: ${options.toolCallCount ?? 0}`,
      "",
      validationMarkdown(validation),
      "",
      state.last.filesChanged.length
        ? `Changed files:\n${state.last.filesChanged.map((file) => `- ${file}`).join("\n")}`
        : "Changed files: none recorded",
    ].join("\n")
  )

  applyCheckpointOutcome(
    state,
    { decision, toolCallCount: options.toolCallCount ?? 0 },
    validation,
    { once: options.command.once }
  )

  await saveGoalState(options.stateDir, state)
  return state
}
