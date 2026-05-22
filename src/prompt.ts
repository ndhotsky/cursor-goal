import type { GoalState, ValidationResult } from "./types.js"

export function buildContinuationPrompt(state: GoalState, previousValidation?: ValidationResult) {
  const currentTurn = state.usage.turnsUsed + 1
  const verification = state.verification.command ?? "No shell verification command configured. Use concrete evidence from files, commands, artifacts, or logs."
  const previous = previousValidation ? summarizeValidation(previousValidation) : "No previous verification result in this run."

  return `Continue working toward the active workspace goal.

ACTIVE GOAL
Objective:
${state.objective}

Lifecycle status: ${state.status}
Checkpoint: ${currentTurn} of ${state.budgets.maxTurns}
Verification surface: ${verification}
Previous verification: ${previous}
Last decision: ${state.last.decision ? `${state.last.decision.status} — ${state.last.decision.reason}` : "none"}
Changed files previously observed: ${(state.last.filesChanged ?? []).join(", ") || "none recorded"}

OPERATING CONTRACT
- Treat the goal text as both the starting prompt and the completion criteria.
- Make one bounded checkpoint of concrete progress. Prefer small, auditable changes over sweeping rewrites.
- Use repository evidence: files inspected, diffs, tests, command output, generated artifacts, benchmark results, or source material.
- Before declaring completion, perform a completion audit against the objective and the evidence. Do not mark complete merely because the latest local subtask succeeded.
- If a verification command is configured, do not report completion unless it has passed or you can justify why it is no longer the relevant verification surface.
- If the goal is not complete but there is a clear next action, continue the work in this checkpoint.
- If there is no defensible next action, required credentials are missing, a destructive choice needs user approval, or the verification surface cannot run, report BLOCKED.
- You may not pause, resume, clear, or replace the goal. Those controls belong to the user/runner.
- Avoid destructive commands and avoid editing generated/cache/vendor directories unless the repository requires it.

END-OF-CHECKPOINT FORMAT
End your response with exactly these two machine-readable lines:
GOAL_STATUS: COMPLETE | CONTINUE | BLOCKED
GOAL_REASON: <one short evidence-based sentence>
`
}

function summarizeValidation(result: ValidationResult) {
  if (result.skipped) return result.reason ?? "Verification skipped."
  const status = result.ok ? "passed" : "failed"
  const exit = result.exitCode === undefined ? "" : ` with exit ${result.exitCode}`
  const stderr = result.stderr ? ` stderr: ${clip(result.stderr)}` : ""
  const stdout = result.stdout ? ` stdout: ${clip(result.stdout)}` : ""
  return `${status}${exit}.${stdout}${stderr}`
}

function clip(value: string, max = 1200) {
  const trimmed = value.replace(/\s+/g, " ").trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`
}
