import { parseArgs } from "node:util"
import path from "node:path"
import {
  DEFAULT_MAX_TURNS,
  DEFAULT_MODEL,
  DEFAULT_VALIDATION_TIMEOUT_MS,
  GOAL_OBJECTIVE_MAX_LENGTH,
  type GoalAction,
  type ModelTier,
  type ParsedCli,
} from "./types.js"

type CliActionSpec = {
  action: GoalAction
  objectiveFromRest: boolean
}

const CLI_ACTION_SPECS: Record<string, CliActionSpec> = {
  status: { action: "status", objectiveFromRest: false },
  list: { action: "list", objectiveFromRest: false },
  set: { action: "set", objectiveFromRest: true },
  pause: { action: "pause", objectiveFromRest: false },
  resume: { action: "resume", objectiveFromRest: false },
  clear: { action: "clear", objectiveFromRest: false },
  edit: { action: "edit", objectiveFromRest: true },
  checkpoint: { action: "checkpoint", objectiveFromRest: false },
  prompt: { action: "prompt", objectiveFromRest: false },
  "stop-evaluate": { action: "stop-evaluate", objectiveFromRest: false },
  help: { action: "help", objectiveFromRest: false },
  version: { action: "version", objectiveFromRest: false },
}

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
      "validation-timeout-ms": { type: "string" },
      "allow-destructive": { type: "boolean" },
      once: { type: "boolean" },
      json: { type: "boolean" },
      "assistant-file": { type: "string" },
      "tool-calls": { type: "string" },
      "conversation-id": { type: "string" },
      "workspace-root": { type: "string" },
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

  const resolved = resolveCliAction(parsed.positionals)
  return validateObjectiveIfNeeded({
    ...baseCommand(resolved.action, parsed, env),
    objective: resolved.objective,
  })
}

function resolveCliAction(positionals: string[]): { action: GoalAction; objective?: string } {
  if (positionals.length === 0) {
    return { action: "status" }
  }

  const token = positionals[0]!.toLowerCase()
  const spec = CLI_ACTION_SPECS[token]
  if (spec) {
    const objective = spec.objectiveFromRest ? joinObjective(positionals.slice(1)) : undefined
    return { action: spec.action, objective: objective || undefined }
  }

  return { action: "set", objective: joinObjective(positionals) }
}

export function usage() {
  return `cursor-goal — Codex-style /goal state for Cursor Agent chat

Usage:
  cursor-goal                                         Show current goal
  cursor-goal list                                   List completed goals across workspaces
  cursor-goal "<objective>" [--verify "npm test"]    Set/replace a goal (continue in Cursor with /goal resume)
  cursor-goal pause                                  Pause active goal
  cursor-goal resume                                 Mark goal active (continue in Cursor with /goal resume)
  cursor-goal clear                                  Clear current goal
  cursor-goal edit "<objective>"                     Replace goal text
  cursor-goal prompt                                 Print the continuation prompt for the active goal
  cursor-goal checkpoint                             Record a checkpoint after agent work (stdin or --assistant-file)
  cursor-goal stop-evaluate                          Evaluate a Cursor stop hook (JSON on stdin; JSON on stdout)

Options:
  -v, --verify <cmd>              Verification command. Repeatable; joined with &&.
      --validate <cmd>            Alias for --verify.
      --model <id>                Default: composer-2.5 or CURSOR_GOAL_MODEL.
      --tier auto|fast|standard   Recorded for audit only; Cursor chat uses the composer model you pick.
      --max-turns <n>             Continuation budget. Default: 8. Independent of --once.
      --validation-timeout-ms <n> Timeout for verification command. Default: 300000.
      --allow-destructive         Permit dangerous shell patterns in verification.
      --once                      After a checkpoint, pause if still active (does not change turn budget).
      --assistant-file <path>     Assistant text for checkpoint (must include GOAL_STATUS lines).
      --tool-calls <n>            Tool calls made during the checkpoint. Default: 0.
      --conversation-id <id>      Link this goal to a Cursor chat (set/resume; used by stop hook).
      --workspace-root <path>     Workspace root for chat-linked goals. Default: --cwd.
      --json                      Print machine-readable status or list output.
      --state-dir <path>          Override state location. Use .goal for legacy workspace-local state.

Environment:
  CURSOR_GOAL_MODEL               Optional default model id recorded in goal state.
  CURSOR_GOAL_STATE_DIR           Optional default state directory.
  CURSOR_GOAL_STATE_SCOPE         Set to workspace for legacy <cwd>/.goal state.
`
}

function resolveStateDirOption(parsed: ReturnType<typeof parseArgs>, env: NodeJS.ProcessEnv) {
  if (parsed.values["state-dir"]) return path.resolve(String(parsed.values["state-dir"]))
  if (env.CURSOR_GOAL_STATE_DIR) return path.resolve(env.CURSOR_GOAL_STATE_DIR)
  if (env.CURSOR_GOAL_STATE_SCOPE === "workspace" || env.CURSOR_GOAL_LEGACY_WORKSPACE_STATE === "1") {
    return path.join(path.resolve(String(parsed.values.cwd ?? process.cwd())), ".goal")
  }
  return undefined
}

function baseCommand(action: GoalAction, parsed: ReturnType<typeof parseArgs>, env: NodeJS.ProcessEnv): ParsedCli {
  const verifyValues = [parsed.values.verify, parsed.values.validate]
    .flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []))
    .map((value) => String(value).trim())
    .filter(Boolean)

  return {
    action,
    model: String(parsed.values.model ?? env.CURSOR_GOAL_MODEL ?? DEFAULT_MODEL),
    modelExplicit: parsed.values.model !== undefined,
    tier: parseTier(String(parsed.values.tier ?? "auto")),
    tierExplicit: parsed.values.tier !== undefined,
    cwd: path.resolve(String(parsed.values.cwd ?? process.cwd())),
    stateDir: resolveStateDirOption(parsed, env),
    verifyCommand: verifyValues.length > 0 ? verifyValues.join(" && ") : undefined,
    maxTurns: parsePositiveInt(parsed.values["max-turns"], DEFAULT_MAX_TURNS, "--max-turns"),
    maxTurnsExplicit: parsed.values["max-turns"] !== undefined,
    validationTimeoutMs: parsePositiveInt(parsed.values["validation-timeout-ms"], DEFAULT_VALIDATION_TIMEOUT_MS, "--validation-timeout-ms"),
    validationTimeoutMsExplicit: parsed.values["validation-timeout-ms"] !== undefined,
    allowDestructive: Boolean(parsed.values["allow-destructive"]),
    allowDestructiveExplicit: parsed.values["allow-destructive"] !== undefined,
    once: Boolean(parsed.values.once),
    json: Boolean(parsed.values.json),
    assistantFile: parsed.values["assistant-file"] ? path.resolve(String(parsed.values["assistant-file"])) : undefined,
    toolCalls: parseOptionalNonNegativeInt(parsed.values["tool-calls"], "--tool-calls"),
    conversationId: parseOptionalNonEmptyString(parsed.values["conversation-id"], "--conversation-id"),
    workspaceRoot: parsed.values["workspace-root"]
      ? path.resolve(String(parsed.values["workspace-root"]))
      : undefined,
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

function parseOptionalNonNegativeInt(value: unknown, flag: string) {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${flag} must be a non-negative integer.`)
  }
  return n
}

function parseOptionalNonEmptyString(value: unknown, flag: string) {
  if (value === undefined) return undefined
  const text = String(value).trim()
  if (!text) {
    throw new Error(`${flag} must be a non-empty string.`)
  }
  return text
}
