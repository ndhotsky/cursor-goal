import test from "node:test"
import assert from "node:assert/strict"
import { normalizeStatus, parseGoalDecision } from "../src/statusParser.js"

test("normalizes Codex-ish status values", () => {
  assert.equal(normalizeStatus("DONE"), "complete")
  assert.equal(normalizeStatus("complete"), "complete")
  assert.equal(normalizeStatus("needs input"), "blocked")
  assert.equal(normalizeStatus("continue"), "continue")
})

test("parses final machine readable status", () => {
  const decision = parseGoalDecision(`some text\nGOAL_STATUS: CONTINUE\nGOAL_REASON: tests still fail`)
  assert.deepEqual(decision, {
    status: "continue",
    reason: "tests still fail",
    rawStatus: "CONTINUE",
  })
})

test("uses last status if multiple are present", () => {
  const decision = parseGoalDecision(`GOAL_STATUS: CONTINUE\nGOAL_REASON: first\nGOAL_STATUS: COMPLETE\nGOAL_REASON: final`)
  assert.equal(decision.status, "complete")
  assert.equal(decision.reason, "final")
})
