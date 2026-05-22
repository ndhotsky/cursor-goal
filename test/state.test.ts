import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"
import { parseGoalState } from "../src/parseGoalState.js"
import { createGoalState, loadGoalState, saveGoalState, updateGoalFromCommand } from "../src/state.js"
import { sampleGoalState, sampleParsedCli } from "./helpers/goalFixtures.js"

test("parseGoalState rejects unknown schema version", () => {
  assert.throws(() => parseGoalState({ schemaVersion: 2, goalId: "x" }), /Unsupported goal schema version/)
})

test("parseGoalState rejects missing core fields", () => {
  assert.throws(() => parseGoalState({ schemaVersion: 1 }), /goalId/)
})

test("loadGoalState rejects corrupt persisted state", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-parse-"))
  const stateDir = path.join(tmp, ".goal")
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(path.join(stateDir, "current.json"), JSON.stringify({ schemaVersion: 99 }), "utf8")

  await assert.rejects(() => loadGoalState(stateDir), /Unsupported goal schema version/)
})

test("once does not change maxTurns when creating goal state", () => {
  const state = createGoalState(sampleParsedCli({ once: true, maxTurns: 8 }))
  assert.equal(state.budgets.maxTurns, 8)
})

test("once does not change maxTurns when resuming goal state", () => {
  const state = sampleGoalState({ usage: { turnsUsed: 3 }, budgets: { maxTurns: 8 } })
  updateGoalFromCommand(state, sampleParsedCli({ action: "resume", once: true, maxTurns: 8 }))
  assert.equal(state.budgets.maxTurns, 8)
  assert.equal(state.usage.turnsUsed, 3)
})
