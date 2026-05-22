import type { GoalDecision, GoalDecisionStatus } from "./types.js"

const STATUS_LINE = /^\s*GOAL_STATUS\s*:\s*([A-Z_ -]+)\s*$/gim
const REASON_LINE = /^\s*GOAL_REASON\s*:\s*(.+?)\s*$/gim
const XMLISH_STATUS = /<goal-status\s+[^>]*status=["']([^"']+)["'][^>]*>/gim
const XMLISH_REASON = /<goal-reason>(.*?)<\/goal-reason>/gis

export function parseGoalDecision(text: string): GoalDecision {
  const rawStatus = lastMatch(text, STATUS_LINE) ?? lastMatch(text, XMLISH_STATUS)
  const reason =
    lastMatch(text, REASON_LINE) ?? stripXmlishReason(lastMatch(text, XMLISH_REASON)) ?? "No explicit GOAL_REASON was provided."

  if (!rawStatus) {
    return { status: "continue", reason, rawStatus: undefined }
  }

  return { status: normalizeStatus(rawStatus), reason, rawStatus }
}

export function normalizeStatus(value: string): GoalDecisionStatus {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_")

  if (["done", "complete", "completed", "success", "succeeded"].includes(normalized)) {
    return "complete"
  }

  if (["blocked", "stuck", "needs_user", "needs_input"].includes(normalized)) {
    return "blocked"
  }

  return "continue"
}

function lastMatch(text: string, pattern: RegExp): string | undefined {
  pattern.lastIndex = 0
  let result: RegExpExecArray | null = null
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    result = match
  }

  return result?.[1]?.trim()
}

function stripXmlishReason(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim()
}
