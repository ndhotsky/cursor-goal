import type { GoalLifecycleStatus, GoalState, ModelTier } from "./types.js"

const LIFECYCLE_STATUSES = new Set<GoalLifecycleStatus>([
  "active",
  "paused",
  "complete",
  "blocked",
  "budget_limited",
])

const MODEL_TIERS = new Set<ModelTier>(["auto", "fast", "standard"])

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

  const last = value.last
  if (last !== undefined && (typeof last !== "object" || last === null)) {
    throw new Error("Goal state field last must be an object when present.")
  }

  return {
    schemaVersion: 1,
    goalId,
    cwd,
    objective,
    status,
    createdAt,
    updatedAt,
    modelRequested,
    modelResolved:
      value.modelResolved === undefined
        ? undefined
        : typeof value.modelResolved === "object" && value.modelResolved !== null
          ? (value.modelResolved as GoalState["modelResolved"])
          : (() => {
              throw new Error("Goal state field modelResolved must be an object when present.")
            })(),
    tier,
    verification,
    budgets,
    usage,
    runLogPath,
    last: (last ?? {}) as GoalState["last"],
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
  const turnsUsed = u.turnsUsed
  if (!Number.isInteger(turnsUsed) || (turnsUsed as number) < 0) {
    throw new Error("Goal state field usage.turnsUsed must be a non-negative integer.")
  }
  return { turnsUsed: turnsUsed as number }
}

function requireHistory(value: unknown): GoalState["history"] {
  if (!Array.isArray(value)) {
    throw new Error("Goal state field history must be an array.")
  }
  return value as GoalState["history"]
}

function requirePositiveNumber(value: unknown, field: string) {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`Goal state field ${field} must be a positive integer.`)
  }
  return value as number
}

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Goal state field ${field} must be a boolean.`)
  }
  return value
}
