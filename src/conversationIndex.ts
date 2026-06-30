import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import os from "node:os"
import type { ConversationIndexEntry } from "./types.js"

export function resolveConversationsRoot(explicit?: string) {
  if (explicit) return path.resolve(explicit)
  if (process.env.CURSOR_GOAL_CONVERSATIONS_DIR) {
    return path.resolve(process.env.CURSOR_GOAL_CONVERSATIONS_DIR)
  }

  const stateRoot = process.env.XDG_STATE_HOME
    ? path.resolve(process.env.XDG_STATE_HOME)
    : path.join(os.homedir(), ".local", "state")
  return path.join(stateRoot, "cursor-goal", "conversations")
}

export function conversationIndexPath(conversationsRoot: string, conversationId: string) {
  const hash = crypto.createHash("sha256").update(conversationId).digest("hex").slice(0, 24)
  return path.join(conversationsRoot, `${hash}.json`)
}

export function parseConversationIndexEntry(raw: unknown): ConversationIndexEntry {
  if (!raw || typeof raw !== "object") {
    throw new Error("Conversation index entry must be a JSON object.")
  }

  const entry = raw as Record<string, unknown>
  const conversationId = requireNonEmptyString(entry.conversation_id, "conversation_id")
  const stateDir = requireNonEmptyString(entry.state_dir, "state_dir")
  const workspaceRoot = requireNonEmptyString(entry.workspace_root, "workspace_root")
  const linkedAt = requireNonEmptyString(entry.linked_at, "linked_at")

  return {
    conversation_id: conversationId,
    state_dir: path.resolve(stateDir),
    workspace_root: path.resolve(workspaceRoot),
    linked_at: linkedAt,
  }
}

export async function loadConversationIndex(
  conversationId: string,
  conversationsRoot = resolveConversationsRoot()
): Promise<ConversationIndexEntry | null> {
  try {
    const raw = await fs.readFile(conversationIndexPath(conversationsRoot, conversationId), "utf8")
    return parseConversationIndexEntry(JSON.parse(raw) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

export async function linkConversationGoal(options: {
  conversationId: string
  stateDir: string
  workspaceRoot: string
  conversationsRoot?: string
  linkedAt?: string
}) {
  const conversationsRoot = options.conversationsRoot ?? resolveConversationsRoot()
  const stateDir = path.resolve(options.stateDir)
  await clearConversationIndexForStateDir(stateDir, conversationsRoot)

  const entry: ConversationIndexEntry = {
    conversation_id: options.conversationId,
    state_dir: stateDir,
    workspace_root: path.resolve(options.workspaceRoot),
    linked_at: options.linkedAt ?? new Date().toISOString(),
  }

  await fs.mkdir(conversationsRoot, { recursive: true })
  const target = conversationIndexPath(conversationsRoot, options.conversationId)
  const tmp = `${target}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(entry, null, 2)}\n`, "utf8")
  await fs.rename(tmp, target)
  return entry
}

export async function clearConversationIndex(
  conversationId: string,
  conversationsRoot = resolveConversationsRoot()
) {
  try {
    await fs.rm(conversationIndexPath(conversationsRoot, conversationId))
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function clearConversationIndexForStateDir(
  stateDir: string,
  conversationsRoot = resolveConversationsRoot()
) {
  const resolved = path.resolve(stateDir)
  let removed = 0

  let names: string[]
  try {
    names = await fs.readdir(conversationsRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0
    throw error
  }

  for (const name of names) {
    if (!name.endsWith(".json")) continue
    const filePath = path.join(conversationsRoot, name)
    try {
      const raw = await fs.readFile(filePath, "utf8")
      const entry = parseConversationIndexEntry(JSON.parse(raw) as unknown)
      if (entry.state_dir !== resolved) continue
      await fs.rm(filePath)
      removed += 1
    } catch {
      continue
    }
  }

  return removed
}

function requireNonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Conversation index entry missing or invalid ${field}.`)
  }
  return value.trim()
}
