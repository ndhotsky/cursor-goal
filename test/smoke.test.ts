import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"
import { recordCheckpoint } from "../src/checkpoint.js"
import { loadConversationIndex } from "../src/conversationIndex.js"
import { currentStatePath, loadGoalState, saveGoalState } from "../src/state.js"
import { sampleGoalState, sampleParsedCli } from "./helpers/goalFixtures.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cliEntry = path.join(repoRoot, "src/index.ts")

function runCli(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync("npx", ["tsx", cliEntry, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  })

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

test("CLI lifecycle smoke", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-smoke-"))
  const stateDir = path.join(tmp, ".goal")

  const set = runCli([
    "Write smoke marker for cursor-goal",
    "--verify",
    `test -f ${path.join(tmp, "smoke-marker.txt")}`,
    "--state-dir",
    stateDir,
    "--max-turns",
    "3",
  ])

  assert.equal(set.status, 0, set.stderr)
  assert.match(set.stdout, /Goal set:/)
  assert.match(set.stdout, /\/goal resume/)

  const state = await loadGoalState(stateDir)
  assert.ok(state)
  assert.equal(state.status, "active")

  const status = runCli(["--state-dir", stateDir])
  assert.equal(status.status, 0, status.stderr)
  assert.match(status.stdout, /Goal: active/)

  const pause = runCli(["pause", "--state-dir", stateDir])
  assert.equal(pause.status, 0, pause.stderr)
  assert.match(pause.stdout, /Goal: paused/)

  const clear = runCli(["clear", "--state-dir", stateDir])
  assert.equal(clear.status, 0, clear.stderr)
  assert.match(clear.stdout, /Goal cleared/)

  assert.equal(await loadGoalState(stateDir), null)
})

test("checkpoint completes goal with real verification", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-loop-"))
  const marker = path.join(tmp, "smoke-marker.txt")
  const stateDir = path.join(tmp, ".goal")
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(marker, "ok\n", "utf8")

  const state = sampleGoalState({
    cwd: tmp,
    verification: {
      command: `test -f ${marker}`,
      timeoutMs: 5_000,
      allowDestructive: false,
    },
    runLogPath: path.join(stateDir, "runs", "smoke-test.md"),
  })
  await saveGoalState(stateDir, state)

  const result = await recordCheckpoint({
    stateDir,
    command: sampleParsedCli({ cwd: tmp, once: true, verifyCommand: `test -f ${marker}` }),
    assistantText: "Created marker.\nGOAL_STATUS: COMPLETE\nGOAL_REASON: smoke marker exists",
    toolCallCount: 1,
  })

  assert.equal(result.status, "complete")
  const saved = await loadGoalState(stateDir)
  assert.equal(saved?.status, "complete")
  assert.equal(await fs.readFile(currentStatePath(stateDir), "utf8").then((raw) => JSON.parse(raw).status), "complete")
})

test("CLI checkpoint command records completion", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-checkpoint-"))
  const marker = path.join(tmp, "marker.txt")
  const stateDir = path.join(tmp, ".goal")
  await fs.writeFile(marker, "ok\n", "utf8")

  const set = runCli([
    "Checkpoint smoke",
    "--verify",
    `test -f ${marker}`,
    "--state-dir",
    stateDir,
  ])
  assert.equal(set.status, 0, set.stderr)

  const checkpoint = spawnSync(
    "npx",
    ["tsx", cliEntry, "checkpoint", "--state-dir", stateDir, "--tool-calls", "1"],
    {
      cwd: tmp,
      input: "done\nGOAL_STATUS: COMPLETE\nGOAL_REASON: marker exists\n",
      encoding: "utf8",
    }
  )

  assert.equal(checkpoint.status, 0, checkpoint.stderr)
  assert.match(checkpoint.stdout ?? "", /Goal: complete/)
})

test("edit relinks the conversation index", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-edit-link-"))
  const stateDir = path.join(tmp, ".goal")
  const conversationsRoot = path.join(tmp, "conversations")
  const env = { CURSOR_GOAL_CONVERSATIONS_DIR: conversationsRoot }

  const set = runCli(["Initial objective", "--state-dir", stateDir, "--cwd", tmp], env)
  assert.equal(set.status, 0, set.stderr)
  assert.equal(await loadConversationIndex("conv-edit-1", conversationsRoot), null)

  const edit = runCli(
    ["edit", "Refined objective", "--state-dir", stateDir, "--cwd", tmp, "--conversation-id", "conv-edit-1"],
    env
  )
  assert.equal(edit.status, 0, edit.stderr)

  const linked = await loadConversationIndex("conv-edit-1", conversationsRoot)
  assert.ok(linked, "edit --conversation-id should link the conversation index")
  assert.equal(linked.state_dir, stateDir)
})

test("stop-evaluate rejects malformed stdin JSON with a clear error", () => {
  const result = spawnSync("npx", ["tsx", cliEntry, "stop-evaluate"], {
    cwd: repoRoot,
    input: "this is not json{",
    encoding: "utf8",
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr ?? "", /must be valid JSON/)
})
