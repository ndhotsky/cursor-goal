import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"
import { formatCompletedGoalsList, listCompletedGoals, resolveWorkspacesRoot } from "../src/listGoals.js"
import { saveGoalState } from "../src/state.js"
import { sampleGoalState } from "./helpers/goalFixtures.js"

async function writeCompletedRunLog(runsDir: string, options: {
  goalId: string
  objective: string
  cwd: string
  complete?: boolean
}) {
  await fs.mkdir(runsDir, { recursive: true })
  const runLogPath = path.join(runsDir, `${options.goalId}.md`)
  const body = [
    `# Goal run: ${options.objective}`,
    "",
    `- Goal ID: ${options.goalId}`,
    `- Created: 2026-06-01T10:00:00.000Z`,
    `- CWD: ${options.cwd}`,
    "",
    "## Checkpoint 1",
    "",
    options.complete === false ? "Assistant status: **continue**" : "Assistant status: **complete**",
    "Reason: done",
    "",
  ].join("\n")
  await fs.writeFile(runLogPath, body, "utf8")
  return runLogPath
}

test("listCompletedGoals returns empty list when no workspaces exist", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-list-empty-"))
  const previous = process.env.XDG_STATE_HOME
  process.env.XDG_STATE_HOME = tmp

  try {
    assert.deepEqual(await listCompletedGoals(), [])
    assert.equal(formatCompletedGoalsList([]), "No completed goals found.")
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
  }
})

test("listCompletedGoals includes complete current.json", async () => {
  const stateHome = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-list-current-"))
  const workspaceDir = path.join(stateHome, "cursor-goal", "workspaces", "repo-abc123")
  const runLogPath = await writeCompletedRunLog(path.join(workspaceDir, "runs"), {
    goalId: "goal-current",
    objective: "Ship the fix",
    cwd: "/tmp/repo",
  })

  const state = sampleGoalState({
    goalId: "goal-current",
    objective: "Ship the fix",
    status: "complete",
    cwd: "/tmp/repo",
    runLogPath,
    updatedAt: "2026-07-01T12:00:00.000Z",
    history: [
      { at: "2026-06-01T10:00:00.000Z", event: "goal_created" },
      { at: "2026-07-01T12:00:00.000Z", event: "goal_complete" },
    ],
  })
  await saveGoalState(workspaceDir, state)

  const previous = process.env.XDG_STATE_HOME
  process.env.XDG_STATE_HOME = stateHome

  try {
    const entries = await listCompletedGoals()
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.goalId, "goal-current")
    assert.equal(entries[0]?.completedAt, "2026-07-01T12:00:00.000Z")
    assert.equal(entries[0]?.workspaceKey, "repo-abc123")
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
  }
})

test("listCompletedGoals skips active goals and finds completed run logs after clear", async () => {
  const stateHome = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-list-runs-"))
  const activeDir = path.join(stateHome, "cursor-goal", "workspaces", "active-111")
  const clearedDir = path.join(stateHome, "cursor-goal", "workspaces", "cleared-222")

  await saveGoalState(
    activeDir,
    sampleGoalState({
      goalId: "goal-active",
      objective: "Still running",
      status: "active",
      runLogPath: path.join(activeDir, "runs", "goal-active.md"),
    })
  )

  await writeCompletedRunLog(path.join(clearedDir, "runs"), {
    goalId: "goal-cleared",
    objective: "Finished earlier",
    cwd: "/tmp/cleared",
  })

  const previous = process.env.XDG_STATE_HOME
  process.env.XDG_STATE_HOME = stateHome

  try {
    const entries = await listCompletedGoals()
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.goalId, "goal-cleared")
    assert.equal(entries[0]?.objective, "Finished earlier")
    assert.equal(entries[0]?.workspaceKey, "cleared-222")
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
  }
})

test("listCompletedGoals scopes to explicit state dir", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-list-scope-"))
  const first = path.join(root, "workspaces", "one-111")
  const second = path.join(root, "workspaces", "two-222")

  await saveGoalState(
    first,
    sampleGoalState({
      goalId: "goal-one",
      status: "complete",
      objective: "First",
      runLogPath: path.join(first, "runs", "goal-one.md"),
      history: [{ at: "2026-06-02T10:00:00.000Z", event: "goal_complete" }],
    })
  )
  await saveGoalState(
    second,
    sampleGoalState({
      goalId: "goal-two",
      status: "complete",
      objective: "Second",
      runLogPath: path.join(second, "runs", "goal-two.md"),
      history: [{ at: "2026-06-03T10:00:00.000Z", event: "goal_complete" }],
    })
  )

  const entries = await listCompletedGoals(first)
  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.goalId, "goal-one")
})

test("listCompletedGoals sorts newest completed first", async () => {
  const stateHome = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-list-sort-"))
  const olderDir = path.join(stateHome, "cursor-goal", "workspaces", "older-111")
  const newerDir = path.join(stateHome, "cursor-goal", "workspaces", "newer-222")

  await saveGoalState(
    olderDir,
    sampleGoalState({
      goalId: "goal-old",
      status: "complete",
      objective: "Older",
      runLogPath: path.join(olderDir, "runs", "goal-old.md"),
      history: [{ at: "2026-06-01T10:00:00.000Z", event: "goal_complete" }],
    })
  )
  await saveGoalState(
    newerDir,
    sampleGoalState({
      goalId: "goal-new",
      status: "complete",
      objective: "Newer",
      runLogPath: path.join(newerDir, "runs", "goal-new.md"),
      history: [{ at: "2026-07-01T10:00:00.000Z", event: "goal_complete" }],
    })
  )

  const previous = process.env.XDG_STATE_HOME
  process.env.XDG_STATE_HOME = stateHome

  try {
    const entries = await listCompletedGoals()
    assert.deepEqual(entries.map((entry) => entry.goalId), ["goal-new", "goal-old"])
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
  }
})

test("resolveWorkspacesRoot honors XDG_STATE_HOME", () => {
  const previous = process.env.XDG_STATE_HOME
  process.env.XDG_STATE_HOME = "/tmp/xdg-state"
  try {
    assert.equal(resolveWorkspacesRoot(), path.join("/tmp/xdg-state", "cursor-goal", "workspaces"))
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
  }
})
