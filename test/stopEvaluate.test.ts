import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"
import {
  evaluateStopHook,
  formatStopEvaluateOutput,
  parseStopHookInput,
  type StopEvaluateDeps,
} from "../src/stopEvaluate.js"
import {
  clearConversationIndexForStateDir,
  linkConversationGoal,
  loadConversationIndex,
} from "../src/conversationIndex.js"
import { loadGoalState, saveGoalState } from "../src/state.js"
import { sampleGoalState } from "./helpers/goalFixtures.js"
import type { ValidationResult } from "../src/types.js"

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-stop-eval-"))
}

function sampleValidation(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    ok: true,
    skipped: false,
    durationMs: 1,
    stdout: "",
    stderr: "",
    command: "npm test",
    exitCode: 0,
    ...overrides,
  }
}

function buildDeps(options: {
  conversationsRoot: string
  stateDir: string
  runValidation?: StopEvaluateDeps["runValidation"]
}): StopEvaluateDeps {
  return {
    conversationsRoot: options.conversationsRoot,
    loadConversationIndex,
    loadGoalState,
    saveGoalState,
    appendRunLog: async (state, markdown) => {
      await fs.mkdir(path.dirname(state.runLogPath), { recursive: true })
      await fs.appendFile(state.runLogPath, `${markdown}\n\n`, "utf8")
    },
    clearConversationIndexForStateDir,
    runValidation: options.runValidation ?? (async () => sampleValidation()),
  }
}

test("parseStopHookInput validates stop hook payload", () => {
  assert.deepEqual(
    parseStopHookInput({
      conversation_id: "conv-1",
      status: "completed",
      loop_count: 2,
      workspace_roots: ["/tmp/repo"],
    }),
    {
      conversation_id: "conv-1",
      status: "completed",
      loop_count: 2,
      transcript_path: undefined,
      workspace_roots: ["/tmp/repo"],
    }
  )

  assert.throws(() => parseStopHookInput({ status: "done" }), /status/)
})

test("evaluateStopHook allows stop when agent loop did not complete normally", async () => {
  const output = await evaluateStopHook(
    { status: "aborted", loop_count: 0 },
    buildDeps({ conversationsRoot: "/tmp", stateDir: "/tmp/state" })
  )
  assert.deepEqual(output, {})
})

test("evaluateStopHook allows stop when no conversation is linked", async () => {
  const output = await evaluateStopHook(
    { conversation_id: "missing", status: "completed", loop_count: 0 },
    buildDeps({ conversationsRoot: "/tmp", stateDir: "/tmp/state" })
  )
  assert.deepEqual(output, {})
})

test("evaluateStopHook continues when verification fails", async () => {
  const root = await tempRoot()
  const conversationsRoot = path.join(root, "conversations")
  const stateDir = path.join(root, "state")
  const state = sampleGoalState({
    cwd: root,
    status: "active",
    verification: {
      command: "npm test",
      timeoutMs: 1000,
      allowDestructive: false,
    },
    runLogPath: path.join(stateDir, "runs", "stop-hook.md"),
  })
  await saveGoalState(stateDir, state)
  await linkConversationGoal({
    conversationId: "conv-fail",
    stateDir,
    workspaceRoot: root,
    conversationsRoot,
  })

  const output = await evaluateStopHook(
    { conversation_id: "conv-fail", status: "completed", loop_count: 1 },
    buildDeps({
      conversationsRoot,
      stateDir,
      runValidation: async () =>
        sampleValidation({
          ok: false,
          exitCode: 1,
          stderr: "2 tests failed",
        }),
    })
  )

  assert.ok("followup_message" in output)
  assert.match(output.followup_message, /Goal not yet complete/)
  assert.match(output.followup_message, /2 tests failed/)

  const saved = await loadGoalState(stateDir)
  assert.equal(saved?.status, "active")
  assert.equal(saved?.last.validation?.ok, false)
})

test("evaluateStopHook completes goal when verification passes", async () => {
  const root = await tempRoot()
  const conversationsRoot = path.join(root, "conversations")
  const stateDir = path.join(root, "state")
  const state = sampleGoalState({
    cwd: root,
    status: "active",
    verification: {
      command: "npm test",
      timeoutMs: 1000,
      allowDestructive: false,
    },
    runLogPath: path.join(stateDir, "runs", "stop-hook-pass.md"),
  })
  await saveGoalState(stateDir, state)
  await linkConversationGoal({
    conversationId: "conv-pass",
    stateDir,
    workspaceRoot: root,
    conversationsRoot,
  })

  const output = await evaluateStopHook(
    { conversation_id: "conv-pass", status: "completed", loop_count: 0 },
    buildDeps({
      conversationsRoot,
      stateDir,
      runValidation: async () => sampleValidation({ ok: true, exitCode: 0 }),
    })
  )

  assert.deepEqual(output, {})
  const saved = await loadGoalState(stateDir)
  assert.equal(saved?.status, "complete")

  const { loadConversationIndex: loadIndex } = await import("../src/conversationIndex.js")
  assert.equal(await loadIndex("conv-pass", conversationsRoot), null)
})

test("evaluateStopHook marks budget_limited when loop_count reaches max turns", async () => {
  const root = await tempRoot()
  const conversationsRoot = path.join(root, "conversations")
  const stateDir = path.join(root, "state")
  const state = sampleGoalState({
    cwd: root,
    status: "active",
    budgets: { maxTurns: 2 },
    runLogPath: path.join(stateDir, "runs", "stop-hook-budget.md"),
  })
  await saveGoalState(stateDir, state)
  await linkConversationGoal({
    conversationId: "conv-budget",
    stateDir,
    workspaceRoot: root,
    conversationsRoot,
  })

  const output = await evaluateStopHook(
    { conversation_id: "conv-budget", status: "completed", loop_count: 2 },
    buildDeps({ conversationsRoot, stateDir })
  )

  assert.deepEqual(output, {})
  const saved = await loadGoalState(stateDir)
  assert.equal(saved?.status, "budget_limited")
})

test("formatStopEvaluateOutput emits hook JSON", () => {
  assert.equal(formatStopEvaluateOutput({}), "{}\n")
  assert.equal(
    formatStopEvaluateOutput({ followup_message: "keep going" }),
    '{"followup_message":"keep going"}\n'
  )
})
