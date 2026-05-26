import test from "node:test"
import assert from "node:assert/strict"
import { parseCli } from "../src/args.js"

test("bare objective maps to set", () => {
  const parsed = parseCli(["Fix auth tests", "--verify", "npm test"], { CURSOR_GOAL_MODEL: "composer-2.5" })
  assert.equal(parsed.action, "set")
  assert.equal(parsed.objective, "Fix auth tests")
  assert.equal(parsed.verifyCommand, "npm test")
})

test("no args maps to status", () => {
  assert.equal(parseCli([], {}).action, "status")
})

test("resume is a control action", () => {
  const parsed = parseCli(["resume"], {})
  assert.equal(parsed.action, "resume")
  assert.equal(parsed.maxTurnsExplicit, false)
})

test("explicit max turns is tracked", () => {
  const parsed = parseCli(["resume", "--max-turns", "2"], {})
  assert.equal(parsed.action, "resume")
  assert.equal(parsed.maxTurns, 2)
  assert.equal(parsed.maxTurnsExplicit, true)
})

test("env model is a default, not an explicit resume override", () => {
  const parsed = parseCli(["resume"], { CURSOR_GOAL_MODEL: "custom-model" })
  assert.equal(parsed.model, "custom-model")
  assert.equal(parsed.modelExplicit, false)
})

test("workspace state scope keeps legacy .goal state location", () => {
  const parsed = parseCli(["status", "--cwd", "/tmp/example"], { CURSOR_GOAL_STATE_SCOPE: "workspace" })
  assert.equal(parsed.stateDir, "/tmp/example/.goal")
})

test("state dir env overrides default state location", () => {
  const parsed = parseCli(["status"], { CURSOR_GOAL_STATE_DIR: "/tmp/cursor-goal-state" })
  assert.equal(parsed.stateDir, "/tmp/cursor-goal-state")
})

test("set keyword maps to set action", () => {
  const parsed = parseCli(["set", "Ship", "the", "fix"], {})
  assert.equal(parsed.action, "set")
  assert.equal(parsed.objective, "Ship the fix")
})

test("rejects invalid tier", () => {
  assert.throws(() => parseCli(["Fix", "--tier", "warp-speed"], {}), /Invalid --tier/)
})
