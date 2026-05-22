import { spawn } from "node:child_process"
import { execFileSync } from "node:child_process"
import { truncateText } from "./text.js"
import type { ValidationResult } from "./types.js"

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-(?:[^\s]*r[^\s]*f|[^\s]*f[^\s]*r)\b/, reason: "rm -rf style deletion" },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: "git reset --hard" },
  { pattern: /\bgit\s+clean\s+-[^\s]*[fd][^\s]*\b/, reason: "git clean -fd style deletion" },
  { pattern: /\bmkfs(?:\.|\s|$)/, reason: "filesystem formatting" },
  { pattern: /\bdd\s+.*\bof=\/?(?:\s|$)/, reason: "raw disk write" },
  { pattern: /\bsudo\s+rm\b/, reason: "sudo rm" },
  { pattern: /\bterraform\s+destroy\b/, reason: "terraform destroy" },
  { pattern: /\bkubectl\s+delete\b/, reason: "kubectl delete" },
  { pattern: /\bdocker\s+system\s+prune\b/, reason: "docker system prune" },
]

export function assertSafeCommand(command: string, allowDestructive: boolean) {
  if (allowDestructive) return

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Refusing to run validation command because it looks destructive (${reason}). Re-run with --allow-destructive only if you really intend this.`)
    }
  }
}

export async function runValidation(options: {
  command?: string
  cwd: string
  timeoutMs: number
  allowDestructive: boolean
}): Promise<ValidationResult> {
  if (!options.command) {
    return {
      ok: true,
      skipped: true,
      durationMs: 0,
      stdout: "",
      stderr: "",
      reason: "No verification command configured. Completion must rely on the model's evidence audit.",
    }
  }

  assertSafeCommand(options.command, options.allowDestructive)

  const started = Date.now()
  let stdout = ""
  let stderr = ""

  return await new Promise<ValidationResult>((resolve) => {
    const child = spawn(options.command!, {
      cwd: options.cwd,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref()
    }, options.timeoutMs)

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
      process.stdout.write(chunk)
    })

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
      process.stderr.write(chunk)
    })

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer)
      resolve({
        command: options.command,
        ok: exitCode === 0,
        skipped: false,
        exitCode,
        signal,
        durationMs: Date.now() - started,
        stdout: truncateText(stdout, 24_000),
        stderr: truncateText(stderr, 24_000),
        reason: signal ? `Process exited by signal ${signal}.` : undefined,
      })
    })

    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({
        command: options.command,
        ok: false,
        skipped: false,
        durationMs: Date.now() - started,
        stdout: truncateText(stdout, 24_000),
        stderr: truncateText(stderr, 24_000),
        reason: error.message,
      })
    })
  })
}

export function listGitChangedFiles(cwd: string): string[] {
  try {
    return execFileSync("git", ["-C", cwd, "diff", "--name-only"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export function workingTreeSummary(cwd: string): string {
  try {
    return execFileSync("git", ["-C", cwd, "status", "--short"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

