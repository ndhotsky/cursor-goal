import fs from "node:fs/promises"
import path from "node:path"
import { loadGoalState, resolveCursorGoalStateRoot } from "./state.js"
import { clipInline, redactHome } from "./text.js"
import type { CompletedGoalSummary, GoalState } from "./types.js"

export function resolveWorkspacesRoot() {
  return path.join(resolveCursorGoalStateRoot(), "workspaces")
}

export async function listCompletedGoals(stateDir?: string): Promise<CompletedGoalSummary[]> {
  const workspaceDirs = stateDir ? [path.resolve(stateDir)] : await discoverWorkspaceDirs()
  const byGoalId = new Map<string, CompletedGoalSummary>()

  for (const workspaceDir of workspaceDirs) {
    const workspaceKey = path.basename(workspaceDir)
    await collectFromCurrentState(workspaceDir, workspaceKey, byGoalId)
    await collectFromRunLogs(workspaceDir, workspaceKey, byGoalId)
  }

  return [...byGoalId.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}

export function formatCompletedGoalsList(entries: CompletedGoalSummary[]) {
  if (entries.length === 0) return "No completed goals found."

  const header = `Completed goals (${entries.length})`
  const rule = "━".repeat(Math.min(header.length, 60))
  const blocks = entries.map((entry) => formatGoalBlock(entry))

  return [header, rule, "", blocks.join("\n\n")].join("\n").trimEnd()
}

function formatGoalBlock(entry: CompletedGoalSummary) {
  const fields: Array<[string, string]> = [
    ["Status", entry.status],
    ["Completed", formatTimestamp(entry.completedAt)],
    ["Repo", entry.cwd ? redactHome(entry.cwd) : "—"],
    ["Run log", redactHome(entry.runLogPath)],
  ]

  const labelWidth = Math.max(...fields.map(([label]) => label.length))
  const rows = fields.map(([label, value], index) => {
    const connector = index === fields.length - 1 ? "└─" : "├─"
    return `  ${connector} ${label.padEnd(labelWidth)}  ${value}`
  })

  return [`◆ ${clipInline(entry.objective, 100)}`, ...rows].join("\n")
}

function formatTimestamp(iso: string) {
  // 2026-07-01T17:13:21.165Z -> 2026-07-01 17:13:21 UTC
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(iso)
  return match ? `${match[1]} ${match[2]} UTC` : iso
}

async function discoverWorkspaceDirs() {
  const root = resolveWorkspacesRoot()
  let names: string[]
  try {
    names = await fs.readdir(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const dirs: string[] = []
  for (const name of names) {
    const dir = path.join(root, name)
    try {
      if ((await fs.stat(dir)).isDirectory()) dirs.push(dir)
    } catch {
      continue
    }
  }
  return dirs
}

async function collectFromCurrentState(
  workspaceDir: string,
  workspaceKey: string,
  byGoalId: Map<string, CompletedGoalSummary>
) {
  const state = await loadGoalState(workspaceDir)
  if (!state || state.status !== "complete") return

  byGoalId.set(state.goalId, summaryFromState(state, workspaceKey))
}

async function collectFromRunLogs(
  workspaceDir: string,
  workspaceKey: string,
  byGoalId: Map<string, CompletedGoalSummary>
) {
  const runsDir = path.join(workspaceDir, "runs")
  let names: string[]
  try {
    names = await fs.readdir(runsDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }

  for (const name of names) {
    if (!name.endsWith(".md")) continue
    const runLogPath = path.join(runsDir, name)
    const parsed = await parseCompletedRunLog(runLogPath)
    if (!parsed || byGoalId.has(parsed.goalId)) continue
    byGoalId.set(parsed.goalId, { ...parsed, workspaceKey })
  }
}

function summaryFromState(state: GoalState, workspaceKey: string): CompletedGoalSummary {
  return {
    goalId: state.goalId,
    objective: state.objective,
    status: "complete",
    completedAt: completedAtFromState(state),
    cwd: state.cwd,
    workspaceKey,
    runLogPath: state.runLogPath,
  }
}

function completedAtFromState(state: GoalState) {
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const event = state.history[i]
    if (event?.event === "goal_complete") return event.at
  }
  return state.updatedAt
}

async function parseCompletedRunLog(runLogPath: string): Promise<Omit<CompletedGoalSummary, "workspaceKey"> | null> {
  let content: string
  try {
    content = await fs.readFile(runLogPath, "utf8")
  } catch {
    return null
  }

  if (!/Assistant status: \*\*complete\*\*/i.test(content)) return null

  const objective = content.match(/^# Goal run: (.+)$/m)?.[1]?.trim()
  const goalId = content.match(/^- Goal ID: (.+)$/m)?.[1]?.trim()
  if (!objective || !goalId) return null

  const cwd = content.match(/^- CWD: (.+)$/m)?.[1]?.trim() ?? ""
  const stat = await fs.stat(runLogPath)

  return {
    goalId,
    objective,
    status: "complete",
    completedAt: stat.mtime.toISOString(),
    cwd,
    runLogPath,
  }
}
