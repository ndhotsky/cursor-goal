import type { GoalState, ValidationResult } from "./types.js"
import { clipInline, truncateText } from "./text.js"
import {
  appendRunLog,
  loadGoalState,
  saveGoalState,
  setGoalStatus,
  validationMarkdown,
} from "./state.js"
import {
  clearConversationIndexForStateDir,
  loadConversationIndex,
  resolveConversationsRoot,
} from "./conversationIndex.js"
import { runValidation } from "./validation.js"

export type StopHookStatus = "completed" | "aborted" | "error"

export type StopHookInput = {
  conversation_id?: string
  status: StopHookStatus
  loop_count: number
  transcript_path?: string | null
  workspace_roots?: string[]
}

export type StopEvaluateOutput = Record<string, never> | { followup_message: string }

export type StopEvaluateDeps = {
  conversationsRoot: string
  loadConversationIndex: typeof loadConversationIndex
  loadGoalState: typeof loadGoalState
  saveGoalState: typeof saveGoalState
  appendRunLog: typeof appendRunLog
  clearConversationIndexForStateDir: typeof clearConversationIndexForStateDir
  runValidation: typeof runValidation
}

const defaultDeps = (): StopEvaluateDeps => ({
  conversationsRoot: resolveConversationsRoot(),
  loadConversationIndex,
  loadGoalState,
  saveGoalState,
  appendRunLog,
  clearConversationIndexForStateDir,
  runValidation,
})

export function parseStopHookInput(raw: unknown): StopHookInput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Stop hook input must be a JSON object.")
  }

  const input = raw as Record<string, unknown>
  const status = requireStopStatus(input.status)
  const loopCount = requireNonNegativeInteger(input.loop_count, "loop_count")

  return {
    conversation_id: optionalNonEmptyString(input.conversation_id),
    status,
    loop_count: loopCount,
    transcript_path:
      input.transcript_path === null || input.transcript_path === undefined
        ? input.transcript_path ?? undefined
        : String(input.transcript_path),
    workspace_roots: Array.isArray(input.workspace_roots)
      ? input.workspace_roots.map((root) => String(root))
      : undefined,
  }
}

export function formatStopEvaluateOutput(output: StopEvaluateOutput) {
  return `${JSON.stringify(output)}\n`
}

export async function evaluateStopHook(
  input: StopHookInput,
  deps: StopEvaluateDeps = defaultDeps()
): Promise<StopEvaluateOutput> {
  if (input.status !== "completed") {
    return {}
  }

  if (!input.conversation_id) {
    return {}
  }

  const index = await deps.loadConversationIndex(input.conversation_id, deps.conversationsRoot)
  if (!index) {
    return {}
  }

  const state = await deps.loadGoalState(index.state_dir)
  if (!state || state.status !== "active") {
    return {}
  }

  if (input.loop_count >= state.budgets.maxTurns) {
    await finalizeStopEvaluation({
      deps,
      stateDir: index.state_dir,
      state,
      status: "budget_limited",
      reason: `Stop hook turn budget reached (${input.loop_count}/${state.budgets.maxTurns}).`,
      markdown: `Stop hook loop_count ${input.loop_count} reached max turns ${state.budgets.maxTurns}.`,
    })
    return {}
  }

  const cwd = resolveStopCwd(state, index.workspace_root, input.workspace_roots)
  const validation = await deps.runValidation({
    command: state.verification.command,
    cwd,
    timeoutMs: state.verification.timeoutMs,
    allowDestructive: state.verification.allowDestructive,
    echo: false,
  })

  state.last.validation = validation
  await deps.appendRunLog(
    state,
    [
      "## Stop hook evaluation",
      "",
      `At: ${new Date().toISOString()}`,
      `Loop count: ${input.loop_count}`,
      "",
      validationMarkdown(validation),
    ].join("\n")
  )

  if (validation.skipped) {
    return buildContinueOutput(
      state,
      "No verification command is configured. Continue working toward the goal objective and provide evidence in the transcript."
    )
  }

  if (!validation.ok) {
    await deps.saveGoalState(index.state_dir, state)
    return buildContinueOutput(state, formatValidationFailureReason(validation))
  }

  await finalizeStopEvaluation({
    deps,
    stateDir: index.state_dir,
    state,
    status: "complete",
    reason: "Verification passed at stop hook.",
    markdown: "Stop hook verification passed; goal marked complete.",
  })
  return {}
}

function buildContinueOutput(state: GoalState, reason: string): StopEvaluateOutput {
  return {
    followup_message: [
      "Goal not yet complete. Continue working in this chat.",
      "",
      `Objective: ${clipInline(state.objective, 500)}`,
      `Reason: ${clipInline(reason, 1000)}`,
      state.verification.command ? `Verification: ${state.verification.command}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

function formatValidationFailureReason(validation: ValidationResult) {
  const parts = [
    validation.command ? `Command \`${validation.command}\` failed` : "Verification failed",
    validation.exitCode !== undefined && validation.exitCode !== null
      ? `(exit ${validation.exitCode})`
      : undefined,
  ].filter(Boolean)

  const stderr = validation.stderr.trim()
  const stdout = validation.stdout.trim()
  const output = stderr || stdout
  if (output) {
    parts.push(truncateText(output, 2000))
  }

  return parts.join("\n")
}

async function finalizeStopEvaluation(options: {
  deps: StopEvaluateDeps
  stateDir: string
  state: GoalState
  status: "complete" | "budget_limited"
  reason: string
  markdown: string
}) {
  setGoalStatus(options.state, options.status, options.reason)
  await options.deps.appendRunLog(options.state, `## Stop hook finalized\n\n${options.markdown}`)
  await options.deps.saveGoalState(options.stateDir, options.state)
  await options.deps.clearConversationIndexForStateDir(options.stateDir, options.deps.conversationsRoot)
}

function resolveStopCwd(state: GoalState, workspaceRoot: string, workspaceRoots?: string[]) {
  return state.cwd || workspaceRoot || workspaceRoots?.[0] || process.cwd()
}

function requireStopStatus(value: unknown): StopHookStatus {
  if (value === "completed" || value === "aborted" || value === "error") {
    return value
  }
  throw new Error(`Stop hook input missing or invalid status (expected completed, aborted, or error).`)
}

function requireNonNegativeInteger(value: unknown, field: string) {
  if (value === undefined || value === null) return 0
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Stop hook input missing or invalid ${field}.`)
  }
  return n
}

function optionalNonEmptyString(value: unknown) {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text || undefined
}
