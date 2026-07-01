import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"
import {
  clearConversationIndex,
  clearConversationIndexForStateDir,
  linkConversationGoal,
  loadConversationIndex,
  parseConversationIndexEntry,
} from "../src/conversationIndex.js"

async function tempConversationsRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "cursor-goal-conversations-"))
}

test("parseConversationIndexEntry validates required fields", () => {
  assert.throws(() => parseConversationIndexEntry({}), /conversation_id/)
  assert.throws(
    () =>
      parseConversationIndexEntry({
        conversation_id: "conv-1",
        state_dir: "",
        workspace_root: "/tmp/project",
        linked_at: "2026-01-01T00:00:00.000Z",
      }),
    /state_dir/
  )
})

test("linkConversationGoal writes and loads an index entry", async () => {
  const conversationsRoot = await tempConversationsRoot()
  const stateDir = path.join(conversationsRoot, "workspace-state")

  const entry = await linkConversationGoal({
    conversationId: "conv-abc-123",
    stateDir,
    workspaceRoot: "/tmp/project",
    conversationsRoot,
  })

  assert.equal(entry.conversation_id, "conv-abc-123")
  assert.equal(entry.state_dir, stateDir)
  assert.equal(entry.workspace_root, "/tmp/project")

  const loaded = await loadConversationIndex("conv-abc-123", conversationsRoot)
  assert.deepEqual(loaded, entry)
})

test("linkConversationGoal replaces prior link for the same state dir", async () => {
  const conversationsRoot = await tempConversationsRoot()
  const stateDir = path.join(conversationsRoot, "workspace-state")

  await linkConversationGoal({
    conversationId: "conv-old",
    stateDir,
    workspaceRoot: "/tmp/project",
    conversationsRoot,
  })

  await linkConversationGoal({
    conversationId: "conv-new",
    stateDir,
    workspaceRoot: "/tmp/project",
    conversationsRoot,
  })

  assert.equal(await loadConversationIndex("conv-old", conversationsRoot), null)
  assert.equal((await loadConversationIndex("conv-new", conversationsRoot))?.state_dir, stateDir)
})

test("clearConversationIndex removes a linked conversation", async () => {
  const conversationsRoot = await tempConversationsRoot()
  const stateDir = path.join(conversationsRoot, "workspace-state")

  await linkConversationGoal({
    conversationId: "conv-clear-me",
    stateDir,
    workspaceRoot: "/tmp/project",
    conversationsRoot,
  })

  assert.equal(await clearConversationIndex("conv-clear-me", conversationsRoot), true)
  assert.equal(await clearConversationIndex("conv-clear-me", conversationsRoot), false)
  assert.equal(await loadConversationIndex("conv-clear-me", conversationsRoot), null)
})

test("clearConversationIndexForStateDir removes entries by state dir", async () => {
  const conversationsRoot = await tempConversationsRoot()
  const stateDir = path.join(conversationsRoot, "workspace-state")
  const otherStateDir = path.join(conversationsRoot, "other-state")

  await linkConversationGoal({
    conversationId: "conv-a",
    stateDir,
    workspaceRoot: "/tmp/project",
    conversationsRoot,
  })
  await linkConversationGoal({
    conversationId: "conv-b",
    stateDir: otherStateDir,
    workspaceRoot: "/tmp/other",
    conversationsRoot,
  })

  assert.equal(await clearConversationIndexForStateDir(stateDir, conversationsRoot), 1)
  assert.equal(await loadConversationIndex("conv-a", conversationsRoot), null)
  assert.ok(await loadConversationIndex("conv-b", conversationsRoot))
})
