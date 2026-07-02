import test from "node:test"
import assert from "node:assert/strict"
import { clipInline, redactHome, tailText, truncateText } from "../src/text.js"

function withHome<T>(home: string | undefined, fn: () => T): T {
  const previous = process.env.HOME
  if (home === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = home
  }
  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previous
    }
  }
}

test("redactHome replaces the home directory prefix", () => {
  withHome("/home/user", () => {
    assert.equal(redactHome("/home/user"), "~")
    assert.equal(redactHome("/home/user/project/file.txt"), "~/project/file.txt")
  })
})

test("redactHome does not redact sibling paths sharing the home prefix", () => {
  withHome("/home/user", () => {
    assert.equal(redactHome("/home/user2/project"), "/home/user2/project")
  })
})

test("redactHome passes through when HOME is unset", () => {
  withHome(undefined, () => {
    assert.equal(redactHome("/home/user/project"), "/home/user/project")
  })
})

test("truncateText annotates truncation", () => {
  assert.equal(truncateText("short", 10), "short")
  assert.match(truncateText("a".repeat(20), 5), /truncated 15 chars/)
})

test("clipInline collapses whitespace and clips", () => {
  assert.equal(clipInline("  a\n  b  ", 10), "a b")
  assert.equal(clipInline("abcdef", 3), "abc…")
})

test("tailText keeps the end of the string", () => {
  assert.equal(tailText("abcdef", 3), "def")
  assert.equal(tailText("abc", 10), "abc")
})
