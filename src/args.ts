import { parseArgs } from "node:util"
import path from "node:path"
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_MODEL,
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_VALIDATION_TIMEOUT_MS,
  GOAL_OBJECTIVE_MAX_LENGTH,
  type GoalAction,
  type ModelTier,
  type ParsedCli,
} from "./types.js"

const CONTROL_ACTIONS = new Set<GoalAction>(["status", "pause", "resume", "clear", "edit", "help", "version"])

export function parseCli(argv: string[], env = process.env): ParsedCli {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      verify: { type: "string", short: "v", multiple: true },
      validate: { type: "string", multiple: true },
      model: { type: "string" },
      tier: { type: "string" },
      cwd: { type: "string" },
      "state-dir": { type: "string" },
      "max-turns": { type: "string" },
      "token-budget": { type: "string" },
      "time-budget-ms": { type: "string" },
      "idle-timeout-ms": { type: "string" },
      "validation-timeout-ms": { type: "string" },
      "allow-destructive": { type: "boolean" },
      "no-continue": { type: "boolean" },
      once: { type: "boolean" },
      json: { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      "show-thinking": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  })

  if (parsed.values.help) {
    return baseCommand("help", parsed, env)
  }

  if (parsed.values.version) {
    return baseCommand("version", parsed, env)
  }

  const positionals = parsed.positionals
  const first = positionals[0]?.toLowerCase()

  if (!first) {
    return baseCommand("status", parsed, env)
  }

  if (CONTROL_ACTIONS.has(first as GoalAction)) {
    const action = first as GoalAction
    const objective = action === "edit" ? joinObjective(positionals.slice(1)) : undefined
    return validateObjectiveIfNeeded({ ...baseCommand(action, parsed, env), objective })
  }

  if (first === "set") {
    return validateObjectiveIfNeeded({ ...baseCommand("set", parsed, env), objective: joinObjective(positionals.slice(1)) })
  }

  return validateObjectiveIfNeeded({ ...baseCommand("set", parsed, env), objective: joinObjective(positionals) })
}

export function usage() {
  return `cursor-goal — Codex-style /goal loops for Cursor SDK agents

Usage:
  cursor-goal                                         Show current goal
  cursor-goal "<objective>" [--verify "npm test"]    Set/replace a goal and start working
  cursor-goal pause                                  Pause active goal
  cursor-goal resume                                 Resume paused goal and continue
  cursor-goal clear                                  Clear current goal
  cursor-goal edit "<objective>"                     Replace goal text and continue

Options:
  -v, --verify <cmd>              Verification command. Repeatable; joined with &&.
      --validate <cmd>            Alias for --verify.
      --model <id>                Default: composer-2.5 or CURSOR_GOAL_MODEL.
      --tier auto|fast|standard   Prefer a Cursor model variant when exposed by the SDK.
      --max-turns <n>             Continuation budget. Default: 8.
      --token-budget <n>          Soft token budget. Default: 50000.
      --time-budget-ms <n>        Optional wall-clock budget.
      --idle-timeout-ms <n>       Stop if no stream event arrives. Default: 300000.
      --validation-timeout-ms <n> Timeout for verification command. Default: 300000.
      --allow-destructive         Permit dangerous shell patterns in verification.
      --once                      Run exactly one checkpoint, then pause if not done.
      --no-continue               Set/edit state but do not start the loop.
      --json                      Print machine-readable status.
      --state-dir <path>          Default: <cwd>/.goal.

Environment:
  CURSOR_API_KEY                  Required for set/resume/edit loops.
  CURSOR_GOAL_MODEL               Optional default model id.
`
}

function baseCommand(action: GoalAction, parsed: ReturnType<typeof parseArgs>, env: NodeJS.ProcessEnv): ParsedCli {
  const verifyValues = [parsed.values.verify, parsed.values.validate]
    .flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []))
    .map((value) => String(value).trim())
    .filter(Boolean)

  return {
    action,
    model: String(parsed.values.model ?? env.CURSOR_GOAL_MODEL ?? DEFAULT_MODEL),
    tier: parseTier(String(parsed.values.tier ?? "auto")),
    cwd: path.resolve(String(parsed.values.cwd ?? process.cwd())),
    stateDir: parsed.values["state-dir"] ? path.resolve(String(parsed.values["state-dir"])) : undefined,
    verifyCommand: verifyValues.length > 0 ? verifyValues.join(" && ") : undefined,
    maxTurns: parsePositiveInt(parsed.values["max-turns"], DEFAULT_MAX_TURNS, "--max-turns"),
    tokenBudget: parsePositiveInt(parsed.values["token-budget"], DEFAULT_TOKEN_BUDGET, "--token-budget"),
    timeBudgetMs: parseOptionalPositiveInt(parsed.values["time-budget-ms"], "--time-budget-ms"),
    idleTimeoutMs: parsePositiveInt(parsed.values["idle-timeout-ms"], DEFAULT_IDLE_TIMEOUT_MS, "--idle-timeout-ms"),
    validationTimeoutMs: parsePositiveInt(parsed.values["validation-timeout-ms"], DEFAULT_VALIDATION_TIMEOUT_MS, "--validation-timeout-ms"),
    allowDestructive: Boolean(parsed.values["allow-destructive"]),
    noContinue: Boolean(parsed.values["no-continue"]),
    once: Boolean(parsed.values.once),
    json: Boolean(parsed.values.json),
    yes: Boolean(parsed.values.yes),
    showThinking: Boolean(parsed.values["show-thinking"]),
  }
}

function joinObjective(parts: string[]) {
  return parts.join(" ").trim()
}

function validateObjectiveIfNeeded(command: ParsedCli): ParsedCli {
  if ((command.action === "set" || command.action === "edit") && !command.objective) {
    throw new Error(`cursor-goal ${command.action === "edit" ? "edit" : "set"} requires a non-empty objective.`)
  }

  if (command.objective && command.objective.length > GOAL_OBJECTIVE_MAX_LENGTH) {
    throw new Error(`Goal objective is ${command.objective.length} characters; max is ${GOAL_OBJECTIVE_MAX_LENGTH}. Put long details in a file and reference it.`)
  }

  return command
}

function parseTier(value: string): ModelTier {
  if (["auto", "fast", "standard"].includes(value)) {
    return value as ModelTier
  }
  throw new Error(`Invalid --tier ${value}. Use auto, fast, or standard.`)
}

function parsePositiveInt(value: unknown, fallback: number, flag: string) {
  if (value === undefined) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer.`)
  }
  return n
}

function parseOptionalPositiveInt(value: unknown, flag: string) {
  if (value === undefined) return undefined
  return parsePositiveInt(value, 1, flag)
}
