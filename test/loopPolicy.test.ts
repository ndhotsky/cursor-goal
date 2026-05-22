import test from "node:test"
import assert from "node:assert/strict"
import { applyCheckpointOutcome, budgetStopReason } from "../src/loopPolicy.js"
import { sampleGoalState } from "./helpers/goalFixtures.js"

test("completes when model reports complete and verification passes", () => {
  const state = sampleGoalState()
  applyCheckpointOutcome(
    state,
    { decision: { status: "complete", reason: "marker exists" }, toolCallCount: 1 },
    { ok: true, skipped: false, durationMs: 1, stdout: "", stderr: "" },
    { once: false }
  )

  assert.equal(state.status, "complete")
})

test("rejects premature completion when verification fails", () => {
  const state = sampleGoalState()
  applyCheckpointOutcome(
    state,
    { decision: { status: "complete", reason: "looks done" }, toolCallCount: 1 },
    { ok: false, skipped: false, durationMs: 1, stdout: "", stderr: "missing", exitCode: 1 },
    { once: false }
  )

  assert.equal(state.status, "active")
  assert.match(state.last.reason ?? "", /verification failed/i)
})

test("blocks spin loop when verification fails with no tool calls", () => {
  const state = sampleGoalState()
  applyCheckpointOutcome(
    state,
    { decision: { status: "continue", reason: "still working" }, toolCallCount: 0 },
    { ok: false, skipped: false, durationMs: 1, stdout: "", stderr: "fail", exitCode: 1 },
    { once: false }
  )

  assert.equal(state.status, "blocked")
})

test("once pauses after a continuing checkpoint", () => {
  const state = sampleGoalState()
  applyCheckpointOutcome(
    state,
    { decision: { status: "continue", reason: "more work" }, toolCallCount: 1 },
    { ok: true, skipped: false, durationMs: 1, stdout: "", stderr: "" },
    { once: true }
  )

  assert.equal(state.status, "paused")
  assert.match(state.last.reason ?? "", /--once/)
})

test("once pauses when completion is rejected by verification", () => {
  const state = sampleGoalState()
  applyCheckpointOutcome(
    state,
    { decision: { status: "complete", reason: "looks done" }, toolCallCount: 1 },
    { ok: false, skipped: false, durationMs: 1, stdout: "", stderr: "missing", exitCode: 1 },
    { once: true }
  )

  assert.equal(state.status, "paused")
  assert.match(state.last.reason ?? "", /--once/)
})

test("budgetStopReason stops at max turns", () => {
  const state = sampleGoalState({ usage: { turnsUsed: 2 } })
  assert.match(budgetStopReason(state) ?? "", /Turn budget reached/)
})
