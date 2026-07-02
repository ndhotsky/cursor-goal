import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import test from "node:test"
import assert from "node:assert/strict"
import { assertSafeCommand, listGitChangedFiles } from "../src/validation.js"

test("blocks obvious destructive validation commands", () => {
  assert.throws(() => assertSafeCommand("rm -rf /tmp/something", false), /destructive/)
  assert.throws(() => assertSafeCommand("git reset --hard", false), /destructive/)
})

test("allows normal test command", () => {
  assert.doesNotThrow(() => assertSafeCommand("npm test", false))
})

test("listGitChangedFiles includes unstaged, staged, and untracked files", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-git-"))
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    })

  git("init", "--quiet")
  await fs.writeFile(path.join(repo, "committed.txt"), "one\n", "utf8")
  git("add", "committed.txt")
  git("commit", "--quiet", "-m", "base")

  await fs.writeFile(path.join(repo, "committed.txt"), "two\n", "utf8")
  await fs.writeFile(path.join(repo, "staged.txt"), "staged\n", "utf8")
  git("add", "staged.txt")
  await fs.writeFile(path.join(repo, "untracked.txt"), "new\n", "utf8")

  const files = listGitChangedFiles(repo)
  assert.ok(files.includes("committed.txt"), `unstaged edit missing: ${files}`)
  assert.ok(files.includes("staged.txt"), `staged file missing: ${files}`)
  assert.ok(files.includes("untracked.txt"), `untracked file missing: ${files}`)
})

test("listGitChangedFiles returns empty outside a git repository", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-nogit-"))
  assert.deepEqual(listGitChangedFiles(dir), [])
})
