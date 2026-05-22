#!/usr/bin/env node
import fs from "node:fs/promises"
import { parseCli, usage } from "./args.js"
import { continuationPromptForState, recordCheckpoint } from "./checkpoint.js"
import { resolveModelLabel } from "./modelLabel.js"
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
import { workingTreeSummary } from "./validation.js"

const CONTINUE_HINT = "Continue in Cursor Agent chat with: /goal resume"

async function main(argv: string[]) {
  const command = parseCli(argv)
  const stateDir = resolveStateDir(command.cwd, command.stateDir)

  if (command.action === "help") {
    console.log(usage())
    return
  }

  if (command.action === "version") {
    console.log("0.2.0")
    return
  }

  if (command.action === "status") {
    printStatus(await loadGoalState(stateDir), command.json)
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

  if (command.action === "prompt") {
    const state = await requireState(stateDir)
    console.log(continuationPromptForState(state))
    return
  }

  if (command.action === "checkpoint") {
    const assistantText = await readAssistantText(command.assistantFile)
    if (!assistantText.trim()) {
      throw new Error("cursor-goal checkpoint requires assistant text via stdin or --assistant-file.")
    }

    const state = await recordCheckpoint({
      stateDir,
      command,
      assistantText,
      toolCallCount: command.toolCalls,
    })
    printStatus(state, command.json)
    if (state.status === "active") {
      console.log(CONTINUE_HINT)
    }
    return
  }

  const model = resolveModelLabel(command.model, command.tier)
  for (const warning of model.warnings) console.warn(`[model] ${warning}`)

  if (command.action === "set") {
    const state = createGoalState(command, model)
    const dirty = workingTreeSummary(state.cwd)
    if (dirty) addHistory(state, "working_tree_dirty_at_start", { status: dirty })
    await writeInitialRunLog(state)
    if (dirty) await appendRunLog(state, `## Initial working tree was not clean\n\n\`\`\`\n${dirty}\n\`\`\``)
    await saveGoalState(stateDir, state)
    console.log(`Goal set: ${state.objective}`)
    console.log(CONTINUE_HINT)
    printStatus(state, command.json)
    return
  }

  if (command.action === "edit" || command.action === "resume") {
    const state = await requireState(stateDir)
    updateGoalFromCommand(state, command, model)
    await appendRunLog(
      state,
      `## ${command.action === "edit" ? "Edited" : "Resumed"}\n\nAt: ${new Date().toISOString()}${command.objective ? `\n\nNew objective:\n${command.objective}` : ""}`
    )
    await saveGoalState(stateDir, state)
    console.log(command.action === "edit" ? "Goal edited." : "Goal resumed.")
    console.log(CONTINUE_HINT)
    printStatus(state, command.json)
    return
  }
}

async function requireState(stateDir: string) {
  const state = await loadGoalState(stateDir)
  if (!state) throw new Error("No goal exists. Set one with: /goal \"<objective>\" or cursor-goal \"<objective>\" --verify \"npm test\"")
  return state
}

async function readAssistantText(filePath?: string) {
  if (filePath) {
    return fs.readFile(filePath, "utf8")
  }

  if (process.stdin.isTTY) {
    return ""
  }

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function printStatus(state: Awaited<ReturnType<typeof loadGoalState>>, asJson: boolean) {
  if (asJson) {
    console.log(JSON.stringify(state, null, 2))
  } else {
    console.log(formatGoalStatus(state))
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
