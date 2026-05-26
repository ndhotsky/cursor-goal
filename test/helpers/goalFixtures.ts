import type { GoalState, ParsedCli } from "../../src/types.js"
import {
  DEFAULT_MAX_TURNS,
  DEFAULT_MODEL,
  DEFAULT_VALIDATION_TIMEOUT_MS,
} from "../../src/types.js"

export function sampleParsedCli(overrides: Partial<ParsedCli> = {}): ParsedCli {
  return {
    action: "set",
    objective: "Write smoke marker file",
    verifyCommand: "test -f .goal/smoke-marker.txt",
    model: DEFAULT_MODEL,
    modelExplicit: false,
    tier: "auto",
    tierExplicit: false,
    cwd: process.cwd(),
    maxTurns: DEFAULT_MAX_TURNS,
    maxTurnsExplicit: false,
    validationTimeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS,
    validationTimeoutMsExplicit: false,
    allowDestructive: false,
    allowDestructiveExplicit: false,
    once: false,
    json: false,
    ...overrides,
  }
}

export function sampleGoalState(overrides: Partial<GoalState> = {}): GoalState {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    goalId: "2026-01-01T00-00-00-000Z-smoke-test-abc123",
    cwd: process.cwd(),
    objective: "Write smoke marker file",
    status: "active",
    createdAt: now,
    updatedAt: now,
    modelRequested: DEFAULT_MODEL,
    modelResolved: {
      requested: DEFAULT_MODEL,
      label: DEFAULT_MODEL,
      warnings: [],
    },
    tier: "auto",
    verification: {
      command: "test -f .goal/smoke-marker.txt",
      timeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS,
      allowDestructive: false,
    },
    budgets: {
      maxTurns: 2,
    },
    usage: {
      turnsUsed: 0,
    },
    runLogPath: ".goal/runs/smoke-test.md",
    last: {},
    history: [],
    ...overrides,
  }
}
