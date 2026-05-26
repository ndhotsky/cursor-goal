#!/usr/bin/env tsx
import fs from "node:fs/promises"
import fss from "node:fs"
import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

type Provider = "native" | "cursor"

type Scenario = {
  id: string
  title: string
  setup?: (workspace: string) => Promise<void>
  prompts: string[]
  verifyCommand: string
  expectedFiles: Record<string, string>
  timeoutMs?: number
  nativeRestartAfterPrompt?: number
  nativeRestartWaitCommand?: string
}

type HarnessOptions = {
  providers: Provider[]
  scenarioIds?: Set<string>
  runs: number
  outDir: string
  nativeModel: string
  cursorModel: string
}

type RunResult = {
  provider: Provider
  scenarioId: string
  run: number
  workspace: string
  transcriptPath: string
  exitCode: number | null
  timedOut: boolean
  status: string
  verificationOk: boolean
  goalDirPresent: boolean
  currentJsonPresent: boolean
  stateFilePresent: boolean
  statePath: string | null
  runLogCount: number
  stateKeys: string[]
  filesOk: boolean
  fileDiffs: string[]
  notes: string[]
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const defaultTimeoutMs = 240_000
const resumeTimeoutMs = 480_000

const scenarios: Scenario[] = [
  {
    id: "single-file",
    title: "single-file exact-content goal",
    prompts: [
      "/goal Create single.txt containing exactly the bytes ok followed by one newline. Verify with: printf 'ok\\n' | cmp -s single.txt -",
    ],
    verifyCommand: "printf 'ok\\n' | cmp -s single.txt -",
    expectedFiles: { "single.txt": "ok\n" },
  },
  {
    id: "multi-file",
    title: "multi-file exact-content goal",
    prompts: [
      "/goal Create alpha.txt containing exactly the bytes alpha followed by one newline and nested/beta.txt containing exactly the bytes beta followed by one newline. Verify with: printf 'alpha\\n' | cmp -s alpha.txt - && printf 'beta\\n' | cmp -s nested/beta.txt -",
    ],
    verifyCommand:
      "printf 'alpha\\n' | cmp -s alpha.txt - && printf 'beta\\n' | cmp -s nested/beta.txt -",
    expectedFiles: { "alpha.txt": "alpha\n", "nested/beta.txt": "beta\n" },
  },
  {
    id: "fail-then-resume",
    title: "failing-verification-then-continue/resume goal",
    prompts: [
      "/goal Two-step resume test. Step 1: create fail-once.txt containing exactly bad followed by one newline, verify that the command fails, and leave the goal active without marking complete. Step 2, only after a later /goal resume, replace fail-once.txt so it contains exactly ok followed by one newline. Verify with: printf 'ok\\n' | cmp -s fail-once.txt -",
      "/goal resume",
    ],
    verifyCommand: "printf 'ok\\n' | cmp -s fail-once.txt -",
    expectedFiles: { "fail-once.txt": "ok\n" },
    timeoutMs: resumeTimeoutMs,
  },
  {
    id: "already-complete",
    title: "already-complete/no-op goal",
    setup: async (workspace) => {
      await fs.writeFile(path.join(workspace, "done.txt"), "ok\n", "utf8")
    },
    prompts: [
      "/goal Ensure done.txt already contains exactly ok followed by one newline. Do not edit it if it is already correct. Verify with: printf 'ok\\n' | cmp -s done.txt -",
    ],
    verifyCommand: "printf 'ok\\n' | cmp -s done.txt -",
    expectedFiles: { "done.txt": "ok\n" },
  },
  {
    id: "fresh-process-resume",
    title: "checkpoint/steady-state resume after a fresh process restart",
    prompts: [
      "/goal Fresh process resume test. First create restart.txt containing exactly pending followed by one newline and leave the goal active without marking complete. On a later /goal resume from a fresh process, change restart.txt so it contains exactly ok followed by one newline and complete. Verify with: printf 'ok\\n' | cmp -s restart.txt -",
      "/goal resume",
    ],
    verifyCommand: "printf 'ok\\n' | cmp -s restart.txt -",
    expectedFiles: { "restart.txt": "ok\n" },
    timeoutMs: resumeTimeoutMs,
    nativeRestartAfterPrompt: 1,
    nativeRestartWaitCommand: "printf 'pending\\n' | cmp -s restart.txt -",
  },
]

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const selected = scenarios.filter((scenario) => !options.scenarioIds || options.scenarioIds.has(scenario.id))
  if (selected.length === 0) {
    throw new Error(`No scenarios selected. Known scenarios: ${scenarios.map((scenario) => scenario.id).join(", ")}`)
  }

  await fs.mkdir(options.outDir, { recursive: true })
  const results: RunResult[] = []

  for (let run = 1; run <= options.runs; run += 1) {
    for (const scenario of selected) {
      for (const provider of options.providers) {
        const result = provider === "native"
          ? await runNativeScenario(scenario, run, options)
          : await runCursorScenario(scenario, run, options)
        results.push(result)
        await writeJson(path.join(options.outDir, "results.json"), results)
        console.log(formatResultLine(result))
      }
    }
  }

  await writeReport(options.outDir, results)
  console.log(`\nReport: ${path.join(options.outDir, "report.md")}`)
  if (results.some((result) => !result.verificationOk || !result.filesOk || result.timedOut || result.exitCode !== 0)) {
    process.exitCode = 1
  }
}

async function runNativeScenario(scenario: Scenario, run: number, options: HarnessOptions): Promise<RunResult> {
  const workspace = await makeWorkspace(options, "native", scenario.id, run)
  if (scenario.setup) await scenario.setup(workspace)
  const transcriptPath = path.join(options.outDir, "transcripts", `native-${scenario.id}-${run}.log`)
  await fs.mkdir(path.dirname(transcriptPath), { recursive: true })

  const promptsPath = path.join(options.outDir, "transcripts", `native-${scenario.id}-${run}.prompts.json`)
  await writeJson(promptsPath, scenario.prompts)
  const child = spawn("python3", [
    path.join(repoRoot, "scripts", "native-goal-driver.py"),
    "--workspace",
    workspace,
    "--model",
    options.nativeModel,
    "--transcript",
    transcriptPath,
    "--prompts-json",
    promptsPath,
    "--verify",
    scenario.verifyCommand,
    "--timeout-seconds",
    String(Math.ceil((scenario.timeoutMs ?? defaultTimeoutMs) / 1000)),
    ...(scenario.nativeRestartAfterPrompt
      ? [
          "--restart-after-prompt",
          String(scenario.nativeRestartAfterPrompt),
          "--restart-wait-command",
          scenario.nativeRestartWaitCommand ?? scenario.verifyCommand,
        ]
      : []),
  ], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const { exitCode, timedOut } = await waitForChild(child, scenario.timeoutMs ?? defaultTimeoutMs)
  await appendStreams(transcriptPath, child)
  return summarizeRun({ provider: "native", scenario, run, workspace, transcriptPath, exitCode, timedOut })
}

async function runCursorScenario(scenario: Scenario, run: number, options: HarnessOptions): Promise<RunResult> {
  const workspace = await makeWorkspace(options, "cursor", scenario.id, run)
  if (scenario.setup) await scenario.setup(workspace)
  await fs.mkdir(path.join(workspace, ".cursor", "skills", "goal"), { recursive: true })
  await fs.copyFile(
    path.join(repoRoot, ".cursor", "skills", "goal", "SKILL.md"),
    path.join(workspace, ".cursor", "skills", "goal", "SKILL.md")
  )

  const binDir = path.join(workspace, ".parity-bin")
  await fs.mkdir(binDir, { recursive: true })
  await fs.writeFile(
    path.join(binDir, "cursor-goal"),
    `#!/usr/bin/env bash\nexec npx tsx ${shellQuote(path.join(repoRoot, "src", "index.ts"))} "$@"\n`,
    { mode: 0o755 }
  )

  const transcriptPath = path.join(options.outDir, "transcripts", `cursor-${scenario.id}-${run}.log`)
  await fs.mkdir(path.dirname(transcriptPath), { recursive: true })
  let exitCode: number | null = 0
  let timedOut = false

  for (const prompt of scenario.prompts) {
    const result = spawnSync(
      "agent",
      ["--print", "--trust", "--force", "--sandbox", "disabled", "--workspace", workspace, "--model", options.cursorModel, prompt],
      {
        cwd: workspace,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
        encoding: "utf8",
        timeout: scenario.timeoutMs ?? defaultTimeoutMs,
      }
    )
    await fs.appendFile(
      transcriptPath,
      [
        `$ agent --print --trust --force --sandbox disabled --workspace ${workspace} --model ${options.cursorModel} ${JSON.stringify(prompt)}`,
        result.stdout ?? "",
        result.stderr ?? "",
        "",
      ].join("\n"),
      "utf8"
    )
    exitCode = result.status
    timedOut = Boolean(result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT")
    if (exitCode !== 0 || timedOut) break
  }

  return summarizeRun({ provider: "cursor", scenario, run, workspace, transcriptPath, exitCode, timedOut })
}

async function summarizeRun(input: {
  provider: Provider
  scenario: Scenario
  run: number
  workspace: string
  transcriptPath: string
  exitCode: number | null
  timedOut: boolean
}): Promise<RunResult> {
  const { provider, scenario, run, workspace, transcriptPath, exitCode, timedOut } = input
  const verification = spawnSync("bash", ["-lc", scenario.verifyCommand], {
    cwd: workspace,
    encoding: "utf8",
  })
  const goalDirPresent = fss.existsSync(path.join(workspace, ".goal"))
  const workspaceStateDir = path.join(workspace, ".goal")
  const workspaceCurrentJsonPath = path.join(workspaceStateDir, "current.json")
  const currentJsonPresent = fss.existsSync(workspaceCurrentJsonPath)
  const externalCursorStateDir = provider === "cursor" ? defaultCursorStateDir(workspace) : null
  const externalCursorCurrentPath = externalCursorStateDir ? path.join(externalCursorStateDir, "current.json") : null
  const statePath = currentJsonPresent
    ? workspaceCurrentJsonPath
    : externalCursorCurrentPath && fss.existsSync(externalCursorCurrentPath)
      ? externalCursorCurrentPath
      : currentJsonPresent
        ? workspaceCurrentJsonPath
        : null
  const stateDir = statePath ? path.dirname(statePath) : workspaceStateDir
  const stateFilePresent = Boolean(statePath)
  const runLogCount = fss.existsSync(path.join(stateDir, "runs"))
    ? fss.readdirSync(path.join(stateDir, "runs")).filter((name) => name.endsWith(".md")).length
    : 0

  let status = inferStatusFromTranscript(await readIfExists(transcriptPath))
  let stateKeys: string[] = []
  if (statePath) {
    try {
      const state = JSON.parse(await fs.readFile(statePath, "utf8")) as { status?: unknown }
      stateKeys = Object.keys(state).sort()
      if (typeof state.status === "string") status = state.status
    } catch {
      stateKeys = ["<invalid-json>"]
    }
  }

  const fileDiffs: string[] = []
  for (const [relative, expected] of Object.entries(scenario.expectedFiles)) {
    const actual = await readIfExists(path.join(workspace, relative))
    if (actual !== expected) {
      fileDiffs.push(`${relative}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
  }

  const notes: string[] = []
  if (provider === "native" && goalDirPresent) notes.push("native wrote .goal unexpectedly")
  if (provider === "cursor" && !goalDirPresent && statePath) notes.push(`cursor state stored externally: ${statePath}`)
  if (provider === "cursor" && !statePath) notes.push("cursor state file was not found")

  return {
    provider,
    scenarioId: scenario.id,
    run,
    workspace,
    transcriptPath,
    exitCode,
    timedOut,
    status,
    verificationOk: verification.status === 0,
    goalDirPresent,
    currentJsonPresent,
    stateFilePresent,
    statePath,
    runLogCount,
    stateKeys,
    filesOk: fileDiffs.length === 0,
    fileDiffs,
    notes,
  }
}

async function makeWorkspace(options: HarnessOptions, provider: Provider, scenarioId: string, run: number) {
  const workspace = path.join(options.outDir, "workspaces", `${provider}-${scenarioId}-${run}`)
  await fs.rm(workspace, { recursive: true, force: true })
  await fs.mkdir(workspace, { recursive: true })
  return workspace
}

function inferStatusFromTranscript(transcript: string) {
  const clean = stripAnsi(transcript)
  if (
    /\[NATIVE_DRIVER_VERIFY_OK\]/i.test(clean)
    || /Goal (?:marked complete|achieved|complete|set and completed|resumed and completed)/i.test(clean)
    || /Goal state is\s+\**complete\**/i.test(clean)
    || /Status:\s+\**complete\**/i.test(clean)
    || /\|\s*Status\s*\|\s*`?complete`?\s*\|/i.test(clean)
    || /goal\s+\**complete\**/i.test(clean)
    || /Marked the goal complete/i.test(clean)
    || /Verification passed/i.test(clean)
  ) return "complete"
  if (/Goal paused/i.test(clean)) return "paused"
  if (/blocked/i.test(clean)) return "blocked"
  if (/Goal active|Pursuing goal|Working/i.test(clean)) return "active"
  return "unknown"
}

async function writeReport(outDir: string, results: RunResult[]) {
  const lines = [
    "# Native Codex / Cursor Goal Parity Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Scenario | Run | Native status | Native verify | Native .goal | Cursor status | Cursor verify | Cursor .goal | Cursor state | Diff |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
  ]

  const keys = new Set(results.map((result) => `${result.scenarioId}:${result.run}`))
  for (const key of [...keys].sort()) {
    const [scenarioId, runText] = key.split(":")
    const run = Number(runText)
    const native = results.find((result) => result.provider === "native" && result.scenarioId === scenarioId && result.run === run)
    const cursor = results.find((result) => result.provider === "cursor" && result.scenarioId === scenarioId && result.run === run)
    const diff = diffSummary(native, cursor)
    lines.push([
      scenarioId,
      String(run),
      native?.status ?? "not-run",
      bool(native?.verificationOk),
      bool(native?.goalDirPresent),
      cursor?.status ?? "not-run",
      bool(cursor?.verificationOk),
      bool(cursor?.goalDirPresent),
      bool(cursor?.stateFilePresent),
      diff,
    ].map((value) => value.replace(/\|/g, "\\|")).join(" | ").replace(/^/, "| ").replace(/$/, " |"))
  }

  lines.push("", "## Raw Results", "", "```json", JSON.stringify(results, null, 2), "```", "")
  await fs.writeFile(path.join(outDir, "report.md"), lines.join("\n"), "utf8")
}

function diffSummary(native?: RunResult, cursor?: RunResult) {
  if (!native || !cursor) return "provider missing"
  const diffs: string[] = []
  if (native.status !== cursor.status) diffs.push(`status ${native.status} vs ${cursor.status}`)
  if (native.verificationOk !== cursor.verificationOk) diffs.push(`verification ${native.verificationOk} vs ${cursor.verificationOk}`)
  if (native.filesOk !== cursor.filesOk) diffs.push("artifact mismatch")
  if (native.goalDirPresent !== cursor.goalDirPresent) diffs.push(`workspace .goal ${native.goalDirPresent} vs ${cursor.goalDirPresent}`)
  if (native.currentJsonPresent !== cursor.currentJsonPresent) diffs.push(`current.json ${native.currentJsonPresent} vs ${cursor.currentJsonPresent}`)
  if (native.exitCode !== 0 || cursor.exitCode !== 0) diffs.push(`exit ${native.exitCode} vs ${cursor.exitCode}`)
  if (native.timedOut !== cursor.timedOut) diffs.push(`timeout ${native.timedOut} vs ${cursor.timedOut}`)
  return diffs.length ? diffs.join("; ") : "none"
}

function formatResultLine(result: RunResult) {
  return [
    result.provider,
    result.scenarioId,
    `run=${result.run}`,
    `status=${result.status}`,
    `verify=${result.verificationOk ? "ok" : "fail"}`,
    `exit=${result.exitCode}`,
    `.goal=${result.goalDirPresent ? "yes" : "no"}`,
    `state=${result.stateFilePresent ? "yes" : "no"}`,
    `files=${result.filesOk ? "ok" : "diff"}`,
  ].join(" ")
}

function parseOptions(argv: string[]): HarnessOptions {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const options: HarnessOptions = {
    providers: ["native", "cursor"],
    runs: 1,
    outDir: path.join(repoRoot, ".tmp", "parity", timestamp),
    nativeModel: "gpt-5.5",
    cursorModel: "composer-2.5",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === "--provider") options.providers = parseProviders(next())
    else if (arg === "--scenario") options.scenarioIds = new Set(next().split(",").map((value) => value.trim()).filter(Boolean))
    else if (arg === "--runs") options.runs = parsePositiveInt(next(), "--runs")
    else if (arg === "--out-dir") options.outDir = path.resolve(next())
    else if (arg === "--native-model") options.nativeModel = next()
    else if (arg === "--cursor-model") options.cursorModel = next()
    else if (arg === "--help" || arg === "-h") {
      console.log(usage())
      process.exit(0)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  return options
}

function parseProviders(value: string): Provider[] {
  const providers = value.split(",").map((item) => item.trim()).filter(Boolean)
  for (const provider of providers) {
    if (provider !== "native" && provider !== "cursor") throw new Error(`Unknown provider: ${provider}`)
  }
  return providers as Provider[]
}

function parsePositiveInt(value: string, flag: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`)
  return parsed
}

function usage() {
  return `Usage: npm run parity -- [options]

Runs isolated native Codex vs Cursor /goal comparisons.

Options:
  --provider native,cursor       Providers to run. Default: native,cursor
  --scenario <ids>               Comma-separated scenario ids. Default: all
  --runs <n>                     Repetitions per selected scenario. Default: 1
  --out-dir <path>               Output directory. Default: .tmp/parity/<timestamp>
  --native-model <id>            Default: gpt-5.5
  --cursor-model <id>            Default: composer-2.5
`
}

async function waitForChild(child: ReturnType<typeof spawn>, timeoutMs: number) {
  let timedOut = false
  const output: Buffer[] = []
  child.stdout?.on("data", (chunk) => output.push(Buffer.from(chunk)))
  child.stderr?.on("data", (chunk) => output.push(Buffer.from(chunk)))
  const exitCode = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref()
    }, timeoutMs)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
  ;(child as unknown as { parityOutput?: Buffer[] }).parityOutput = output
  return { exitCode, timedOut }
}

async function appendStreams(transcriptPath: string, child: ReturnType<typeof spawn>) {
  const output = (child as unknown as { parityOutput?: Buffer[] }).parityOutput ?? []
  if (output.length) {
    await fs.appendFile(transcriptPath, Buffer.concat(output).toString("utf8"), "utf8")
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function readIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
    throw error
  }
}

function stripAnsi(value: string) {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\].*?(\x07|\x1b\\)/g, "")
}

function bool(value: unknown) {
  return value ? "yes" : "no"
}

function defaultCursorStateDir(cwd: string) {
  const resolved = path.resolve(cwd)
  const stateRoot = process.env.XDG_STATE_HOME
    ? path.resolve(process.env.XDG_STATE_HOME)
    : path.join(os.homedir(), ".local", "state")
  const slug = slugify(path.basename(resolved) || "workspace")
  const hash = crypto.createHash("sha256").update(resolved).digest("hex").slice(0, 12)
  return path.join(stateRoot, "cursor-goal", "workspaces", `${slug}-${hash}`)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "goal"
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
