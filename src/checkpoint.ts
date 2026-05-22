import { decideNextState, budgetStopReason } from "./loopPolicy.js"
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
  state.last.assistantTail = tail(options.assistantText)

  const validation = await runValidation({
    command: state.verification.command,
    cwd: state.cwd,
    timeoutMs: state.verification.timeoutMs,
    allowDestructive: state.verification.allowDestructive,
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

  decideNextState(state, {
    assistantText: options.assistantText,
    decision,
    toolCallCount: options.toolCallCount ?? 0,
    usage: {},
    durationMs: 0,
    status: "finished",
  }, validation, options.command)

  if (options.command.once && state.status === "active") {
    setGoalStatus(state, "paused", "--once completed one checkpoint and paused before automatic continuation.")
  }

  await saveGoalState(options.stateDir, state)
  return state
}

function tail(value: string, max = 4000) {
  return value.length <= max ? value : value.slice(value.length - max)
}
