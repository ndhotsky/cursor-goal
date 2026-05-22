#!/usr/bin/env node
import { parseCli, usage } from "./args.js"
import {
  addHistory,
  appendRunLog,
  clearGoalState,
  createGoalState,
  formatGoalStatus,
  loadGoalState,
  resolveStateDir,
  saveGoalState,
  setGoalStatus,
  updateGoalFromCommand,
  writeInitialRunLog,
} from "./state.js"
import type { GoalState } from "./types.js"
import { workingTreeSummary } from "./validation.js"

let liveState: GoalState | undefined
let liveStateDir: string | undefined

process.on("SIGINT", () => {
  void pauseOnSignal("SIGINT").finally(() => process.exit(130))
})
process.on("SIGTERM", () => {
  void pauseOnSignal("SIGTERM").finally(() => process.exit(143))
})

async function main(argv: string[]) {
  const command = parseCli(argv)
  const stateDir = resolveStateDir(command.cwd, command.stateDir)

  if (command.action === "help") {
    console.log(usage())
    return
  }

  if (command.action === "version") {
    console.log("0.1.0")
    return
  }

  if (command.action === "status") {
    const state = await loadGoalState(stateDir)
    printStatus(state, command.json)
    return
  }

  if (command.action === "clear") {
    const existing = await loadGoalState(stateDir)
    if (existing) {
      await appendRunLog(existing, `## Cleared\n\nCleared: ${new Date().toISOString()}`)
    }
    const removed = await clearGoalState(stateDir)
    console.log(removed ? "Goal cleared." : "No goal to clear.")
    return
  }

  if (command.action === "pause") {
    const state = await requireState(stateDir)
    setGoalStatus(state, "paused", "Paused by user.")
    await saveGoalState(stateDir, state)
    await appendRunLog(state, `## Paused\n\nPaused: ${new Date().toISOString()}`)
    printStatus(state, command.json)
    return
  }

  const apiKey = requireApiKey()
  const [{ resolveModel }, { runGoalLoop }] = await Promise.all([
    import("./modelResolver.js"),
    import("./loop.js"),
  ])
  const model = await resolveModel({ apiKey, requested: command.model, tier: command.tier })
  for (const warning of model.warnings) console.warn(`[model] ${warning}`)

  if (command.action === "set") {
    const state = createGoalState(command, model)
    const dirty = workingTreeSummary(state.cwd)
    if (dirty) addHistory(state, "working_tree_dirty_at_start", { status: dirty })
    await writeInitialRunLog(state)
    if (dirty) await appendRunLog(state, `## Initial working tree was not clean\n\n\`\`\`\n${dirty}\n\`\`\``)
    await saveGoalState(stateDir, state)
    liveState = state
    liveStateDir = stateDir
    console.log(`Goal set: ${state.objective}`)
    if (!command.noContinue) {
      await runGoalLoop({ apiKey, stateDir, state, command })
    }
    printStatus(state, command.json)
    return
  }

  if (command.action === "edit" || command.action === "resume") {
    const state = await requireState(stateDir)
    updateGoalFromCommand(state, command, model)
    await appendRunLog(state, `## ${command.action === "edit" ? "Edited" : "Resumed"}\n\nAt: ${new Date().toISOString()}${command.objective ? `\n\nNew objective:\n${command.objective}` : ""}`)
    await saveGoalState(stateDir, state)
    liveState = state
    liveStateDir = stateDir
    if (!command.noContinue) {
      await runGoalLoop({ apiKey, stateDir, state, command })
    }
    printStatus(state, command.json)
    return
  }
}

async function requireState(stateDir: string) {
  const state = await loadGoalState(stateDir)
  if (!state) throw new Error("No goal exists. Set one with: cursor-goal \"<objective>\" --verify \"npm test\"")
  return state
}

function requireApiKey() {
  const apiKey = process.env.CURSOR_API_KEY
  if (!apiKey) throw new Error("CURSOR_API_KEY is required for goal set/resume/edit loops. Put it in your shell or .env before running Cursor SDK agents.")
  return apiKey
}

function printStatus(state: GoalState | null, asJson: boolean) {
  if (asJson) {
    console.log(JSON.stringify(state, null, 2))
  } else {
    console.log(formatGoalStatus(state))
  }
}

async function pauseOnSignal(signal: string) {
  if (!liveState || !liveStateDir || liveState.status !== "active") return
  setGoalStatus(liveState, "paused", `Paused by ${signal}.`)
  await saveGoalState(liveStateDir, liveState)
  await appendRunLog(liveState, `## Paused by signal\n\nSignal: ${signal}\nAt: ${new Date().toISOString()}`)
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
