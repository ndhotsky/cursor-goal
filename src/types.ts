export const GOAL_OBJECTIVE_MAX_LENGTH = 4000
export const DEFAULT_MODEL = "composer-2.5"
export const DEFAULT_MAX_TURNS = 8
export const DEFAULT_TOKEN_BUDGET = 50_000
export const DEFAULT_IDLE_TIMEOUT_MS = 300_000
export const DEFAULT_VALIDATION_TIMEOUT_MS = 300_000

export type GoalLifecycleStatus =
  | "active"
  | "paused"
  | "complete"
  | "blocked"
  | "budget_limited"

export type GoalDecisionStatus = "complete" | "continue" | "blocked"

export type GoalAction = "status" | "set" | "pause" | "resume" | "clear" | "edit" | "help" | "version"

export type ModelTier = "auto" | "fast" | "standard"

export type ModelParamSelection = {
  id: string
  value: string
}

export type ModelSelectionLike = {
  id: string
  params?: ModelParamSelection[]
}

export type ResolvedModelSummary = {
  requested: string
  label: string
  selection: ModelSelectionLike
  source: "exact-id" | "display-name" | "normalized" | "fallback"
  warnings: string[]
}

export type ValidationConfig = {
  command?: string
  timeoutMs: number
  allowDestructive: boolean
}

export type ValidationResult = {
  command?: string
  ok: boolean
  skipped: boolean
  exitCode?: number | null
  signal?: string | null
  durationMs: number
  stdout: string
  stderr: string
  reason?: string
}

export type GoalDecision = {
  status: GoalDecisionStatus
  reason: string
  rawStatus?: string
}

export type TokenUsage = {
  inputTokens?: number
  outputTokens?: number
}

export type GoalBudgets = {
  maxTurns: number
  tokenBudget: number
  timeBudgetMs?: number
  idleTimeoutMs: number
  validationTimeoutMs: number
}

export type GoalUsage = {
  turnsUsed: number
  inputTokens: number
  outputTokens: number
  timeUsedMs: number
}

export type GoalHistoryEvent = {
  at: string
  event: string
  details?: Record<string, unknown>
}

export type GoalState = {
  schemaVersion: 1
  goalId: string
  cwd: string
  objective: string
  status: GoalLifecycleStatus
  createdAt: string
  updatedAt: string
  modelRequested: string
  modelResolved?: ResolvedModelSummary
  tier: ModelTier
  verification: ValidationConfig
  budgets: GoalBudgets
  usage: GoalUsage
  runLogPath: string
  last: {
    decision?: GoalDecision
    validation?: ValidationResult
    assistantTail?: string
    filesChanged?: string[]
    toolCallCount?: number
    reason?: string
  }
  history: GoalHistoryEvent[]
}

export type ParsedCli = {
  action: GoalAction
  objective?: string
  verifyCommand?: string
  model: string
  tier: ModelTier
  cwd: string
  stateDir?: string
  maxTurns: number
  tokenBudget: number
  timeBudgetMs?: number
  idleTimeoutMs: number
  validationTimeoutMs: number
  allowDestructive: boolean
  noContinue: boolean
  once: boolean
  json: boolean
  yes: boolean
  showThinking: boolean
}

export type AgentCheckpointResult = {
  assistantText: string
  decision: GoalDecision
  toolCallCount: number
  usage: TokenUsage
  durationMs: number
  status: string
}
