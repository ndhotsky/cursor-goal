import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"
import { recordCheckpoint } from "../src/checkpoint.js"
import { loadGoalState, saveGoalState } from "../src/state.js"
import { sampleGoalState, sampleParsedCli } from "./helpers/goalFixtures.js"

test("recordCheckpoint applies budget limit before checkpoint work", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-budget-"))
  const stateDir = path.join(tmp, ".goal")
  const state = sampleGoalState({
    cwd: tmp,
    usage: { turnsUsed: 2 },
    budgets: { maxTurns: 2 },
    runLogPath: path.join(stateDir, "runs", "budget-test.md"),
  })
  await saveGoalState(stateDir, state)

  const result = await recordCheckpoint({
    stateDir,
    command: sampleParsedCli({ cwd: tmp, once: false }),
    assistantText: "Still working.\nGOAL_STATUS: CONTINUE\nGOAL_REASON: more to do",
    toolCallCount: 1,
  })

  assert.equal(result.status, "budget_limited")
  assert.equal(result.usage.turnsUsed, 2)

  const saved = await loadGoalState(stateDir)
  assert.equal(saved?.status, "budget_limited")
})
