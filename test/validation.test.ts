import test from "node:test"
import assert from "node:assert/strict"
import { assertSafeCommand } from "../src/validation.js"

test("blocks obvious destructive validation commands", () => {
  assert.throws(() => assertSafeCommand("rm -rf /tmp/something", false), /destructive/)
  assert.throws(() => assertSafeCommand("git reset --hard", false), /destructive/)
})

test("allows normal test command", () => {
  assert.doesNotThrow(() => assertSafeCommand("npm test", false))
})
