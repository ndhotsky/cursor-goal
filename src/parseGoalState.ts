import type {
  GoalDecision,
  GoalDecisionStatus,
  GoalHistoryEvent,
  GoalHistoryEventName,
  GoalLifecycleStatus,
  GoalState,
  ModelTier,
  ResolvedModelSummary,
  ValidationResult,
} from "./types.js"

const LIFECYCLE_STATUSES = new Set<GoalLifecycleStatus>([
  "active",
  "paused",
  "complete",
  "blocked",
  "budget_limited",
])

const MODEL_TIERS = new Set<ModelTier>(["auto", "fast", "standard"])

const DECISION_STATUSES = new Set<GoalDecisionStatus>(["complete", "continue", "blocked"])

const HISTORY_EVENT_NAMES = new Set<GoalHistoryEventName>([
  "goal_active",
  "goal_paused",
  "goal_complete",
  "goal_blocked",
  "goal_budget_limited",
  "goal_created",
  "goal_edited",
  "goal_resumed",
  "completion_rejected_by_validation",
  "goal_continues",
  "working_tree_dirty_at_start",
])

export function parseGoalState(raw: unknown): GoalState {
  if (!raw || typeof raw !== "object") {
    throw new Error("Goal state must be a JSON object.")
  }

  const value = raw as Record<string, unknown>

  if (value.schemaVersion !== 1) {
    throw new Error(`Unsupported goal schema version: ${String(value.schemaVersion)}. Expected 1.`)
  }

  const goalId = requireString(value.goalId, "goalId")
  const cwd = requireString(value.cwd, "cwd")
  const objective = requireString(value.objective, "objective")
  const status = requireLifecycleStatus(value.status)
  const createdAt = requireString(value.createdAt, "createdAt")
  const updatedAt = requireString(value.updatedAt, "updatedAt")
  const modelRequested = requireString(value.modelRequested, "modelRequested")
  const tier = requireTier(value.tier)
  const runLogPath = requireString(value.runLogPath, "runLogPath")
  const verification = requireVerification(value.verification)
  const budgets = requireBudgets(value.budgets)
  const usage = requireUsage(value.usage)
  const history = requireHistory(value.history)

  return {
    schemaVersion: 1,
    goalId,
    cwd,
    objective,
    status,
    createdAt,
    updatedAt,
    modelRequested,
    modelResolved: requireOptionalModelResolved(value.modelResolved),
    tier,
    verification,
    budgets,
    usage,
    runLogPath,
    last: requireLast(value.last),
    history,
  }
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Goal state field ${field} must be a non-empty string.`)
  }
  return value
}

function requireLifecycleStatus(value: unknown): GoalLifecycleStatus {
  if (typeof value !== "string" || !LIFECYCLE_STATUSES.has(value as GoalLifecycleStatus)) {
    throw new Error(`Goal state field status must be one of: ${[...LIFECYCLE_STATUSES].join(", ")}.`)
  }
  return value as GoalLifecycleStatus
}

function requireTier(value: unknown): ModelTier {
  if (typeof value !== "string" || !MODEL_TIERS.has(value as ModelTier)) {
    throw new Error(`Goal state field tier must be one of: ${[...MODEL_TIERS].join(", ")}.`)
  }
  return value as ModelTier
}

function requireVerification(value: unknown): GoalState["verification"] {
  if (!value || typeof value !== "object") {
    throw new Error("Goal state field verification must be an object.")
  }
  const v = value as Record<string, unknown>
  const timeoutMs = requirePositiveNumber(v.timeoutMs, "verification.timeoutMs")
  const allowDestructive = requireBoolean(v.allowDestructive, "verification.allowDestructive")
  const command = v.command === undefined ? undefined : requireString(v.command, "verification.command")
  return { command, timeoutMs, allowDestructive }
}

function requireBudgets(value: unknown): GoalState["budgets"] {
  if (!value || typeof value !== "object") {
    throw new Error("Goal state field budgets must be an object.")
  }
  const b = value as Record<string, unknown>
  return {
    maxTurns: requirePositiveNumber(b.maxTurns, "budgets.maxTurns"),
  }
}

function requireUsage(value: unknown): GoalState["usage"] {
  if (!value || typeof value !== "object") {
    throw new Error("Goal state field usage must be an object.")
  }
  const u = value as Record<string, unknown>
  return { turnsUsed: requireNonNegativeInteger(u.turnsUsed, "usage.turnsUsed") }
}

function requireHistory(value: unknown): GoalState["history"] {
  if (!Array.isArray(value)) {
    throw new Error("Goal state field history must be an array.")
  }
  return value.map((entry, index) => requireHistoryEvent(entry, index))
}

function requireHistoryEvent(value: unknown, index: number): GoalHistoryEvent {
  if (!value || typeof value !== "object") {
    throw new Error(`Goal state history[${index}] must be an object.`)
  }
  const entry = value as Record<string, unknown>
  const at = requireString(entry.at, `history[${index}].at`)
  const event = requireHistoryEventName(entry.event, index)
  const details = entry.details === undefined ? undefined : requireDetailsObject(entry.details, `history[${index}].details`)
  return details === undefined ? { at, event } : { at, event, details }
}

function requireHistoryEventName(value: unknown, index: number): GoalHistoryEventName {
  if (typeof value !== "string" || !HISTORY_EVENT_NAMES.has(value as GoalHistoryEventName)) {
    throw new Error(
      `Goal state history[${index}].event must be one of: ${[...HISTORY_EVENT_NAMES].join(", ")}.`
    )
  }
  return value as GoalHistoryEventName
}

function requireDetailsObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Goal state field ${field} must be a plain object when present.`)
  }
  return value as Record<string, unknown>
}

function requireOptionalModelResolved(value: unknown): ResolvedModelSummary | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object") {
    throw new Error("Goal state field modelResolved must be an object when present.")
  }
  const m = value as Record<string, unknown>
  const requested = requireString(m.requested, "modelResolved.requested")
  const label = requireString(m.label, "modelResolved.label")
  if (!Array.isArray(m.warnings)) {
    throw new Error("Goal state field modelResolved.warnings must be an array.")
  }
  const warnings = m.warnings.map((warning, index) => {
    if (typeof warning !== "string") {
      throw new Error(`Goal state field modelResolved.warnings[${index}] must be a string.`)
    }
    return warning
  })
  return { requested, label, warnings }
}

function requireLast(value: unknown): GoalState["last"] {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Goal state field last must be an object when present.")
  }
  const last = value as Record<string, unknown>
  const parsed: GoalState["last"] = {}

  if (last.decision !== undefined) {
    parsed.decision = requireDecision(last.decision)
  }
  if (last.validation !== undefined) {
    parsed.validation = requireValidationResult(last.validation)
  }
  if (last.assistantTail !== undefined) {
    parsed.assistantTail = requireString(last.assistantTail, "last.assistantTail")
  }
  if (last.filesChanged !== undefined) {
    if (!Array.isArray(last.filesChanged)) {
      throw new Error("Goal state field last.filesChanged must be an array.")
    }
    parsed.filesChanged = last.filesChanged.map((file, index) => {
      if (typeof file !== "string") {
        throw new Error(`Goal state field last.filesChanged[${index}] must be a string.`)
      }
      return file
    })
  }
  if (last.toolCallCount !== undefined) {
    parsed.toolCallCount = requireNonNegativeInteger(last.toolCallCount, "last.toolCallCount")
  }
  if (last.reason !== undefined) {
    parsed.reason = requireString(last.reason, "last.reason")
  }

  return parsed
}

function requireDecision(value: unknown): GoalDecision {
  if (!value || typeof value !== "object") {
    throw new Error("Goal state field last.decision must be an object.")
  }
  const d = value as Record<string, unknown>
  const status = requireDecisionStatus(d.status)
  const reason = typeof d.reason === "string" ? d.reason : ""
  const rawStatus = d.rawStatus === undefined ? undefined : String(d.rawStatus)
  return rawStatus === undefined ? { status, reason } : { status, reason, rawStatus }
}

function requireDecisionStatus(value: unknown): GoalDecisionStatus {
  if (typeof value !== "string" || !DECISION_STATUSES.has(value as GoalDecisionStatus)) {
    throw new Error(`Goal state field last.decision.status must be one of: ${[...DECISION_STATUSES].join(", ")}.`)
  }
  return value as GoalDecisionStatus
}

function requireValidationResult(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    throw new Error("Goal state field last.validation must be an object.")
  }
  const v = value as Record<string, unknown>
  const command = v.command === undefined ? undefined : requireString(v.command, "last.validation.command")
  const ok = requireBoolean(v.ok, "last.validation.ok")
  const skipped = requireBoolean(v.skipped, "last.validation.skipped")
  const durationMs = requireNonNegativeInteger(v.durationMs, "last.validation.durationMs")
  const stdout = typeof v.stdout === "string" ? v.stdout : ""
  const stderr = typeof v.stderr === "string" ? v.stderr : ""
  const exitCode =
    v.exitCode === undefined || v.exitCode === null
      ? v.exitCode === null
        ? null
        : undefined
      : Number.isInteger(v.exitCode)
        ? (v.exitCode as number)
        : (() => {
            throw new Error("Goal state field last.validation.exitCode must be an integer or null.")
          })()
  const signal =
    v.signal === undefined || v.signal === null
      ? v.signal === null
        ? null
        : undefined
      : typeof v.signal === "string"
        ? v.signal
        : (() => {
            throw new Error("Goal state field last.validation.signal must be a string or null.")
          })()
  const reason = v.reason === undefined ? undefined : String(v.reason)
  return { command, ok, skipped, exitCode, signal, durationMs, stdout, stderr, reason }
}

function requirePositiveNumber(value: unknown, field: string) {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`Goal state field ${field} must be a positive integer.`)
  }
  return value as number
}

function requireNonNegativeInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Goal state field ${field} must be a non-negative integer.`)
  }
  return value as number
}

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Goal state field ${field} must be a boolean.`)
  }
  return value
}
