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
  assert.equal(parseCli(["resume"], {}).action, "resume")
})

test("set keyword maps to set action", () => {
  const parsed = parseCli(["set", "Ship", "the", "fix"], {})
  assert.equal(parsed.action, "set")
  assert.equal(parsed.objective, "Ship the fix")
})

test("rejects invalid tier", () => {
  assert.throws(() => parseCli(["Fix", "--tier", "warp-speed"], {}), /Invalid --tier/)
})
