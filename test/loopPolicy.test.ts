import test from "node:test"
import assert from "node:assert/strict"
import { budgetStopReason, decideNextState } from "../src/loopPolicy.js"
import { sampleGoalState } from "./helpers/goalFixtures.js"

test("completes when model reports complete and verification passes", () => {
  const state = sampleGoalState()
  decideNextState(
    state,
  {
    assistantText: "GOAL_STATUS: COMPLETE",
    decision: { status: "complete", reason: "marker exists" },
    toolCallCount: 1,
    usage: {},
    durationMs: 1,
    status: "finished",
  },
    { ok: true, skipped: false, durationMs: 1, stdout: "", stderr: "" },
    { once: false } as never
  )

  assert.equal(state.status, "complete")
})

test("rejects premature completion when verification fails", () => {
  const state = sampleGoalState()
  decideNextState(
    state,
    {
      assistantText: "GOAL_STATUS: COMPLETE",
      decision: { status: "complete", reason: "looks done" },
      toolCallCount: 1,
      usage: {},
      durationMs: 1,
      status: "finished",
    },
    { ok: false, skipped: false, durationMs: 1, stdout: "", stderr: "missing", exitCode: 1 },
    { once: false } as never
  )

  assert.equal(state.status, "active")
  assert.match(state.last.reason ?? "", /verification failed/i)
})

test("blocks spin loop when verification fails with no tool calls", () => {
  const state = sampleGoalState()
  decideNextState(
    state,
    {
      assistantText: "GOAL_STATUS: CONTINUE",
      decision: { status: "continue", reason: "still working" },
      toolCallCount: 0,
      usage: {},
      durationMs: 1,
      status: "finished",
    },
    { ok: false, skipped: false, durationMs: 1, stdout: "", stderr: "fail", exitCode: 1 },
    { once: false } as never
  )

  assert.equal(state.status, "blocked")
})

test("budgetStopReason stops at max turns", () => {
  const state = sampleGoalState({ usage: { turnsUsed: 2, inputTokens: 0, outputTokens: 0, timeUsedMs: 0 } })
  assert.match(budgetStopReason(state) ?? "", /Turn budget reached/)
})
