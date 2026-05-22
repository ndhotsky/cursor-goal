import { Agent, type ModelSelection, type SDKMessage } from "@cursor/sdk"
import { renderSdkEvent } from "./renderEvents.js"
import { parseGoalDecision } from "./statusParser.js"
import type { AgentCheckpointResult, TokenUsage } from "./types.js"

type SDKAgentHandle = Awaited<ReturnType<typeof Agent.create>>

type GoalAgentOptions = {
  apiKey: string
  cwd: string
  model: ModelSelection
}

export class GoalAgent {
  private constructor(private readonly agent: SDKAgentHandle) {}

  static async create(options: GoalAgentOptions) {
    const agent = await Agent.create({
      apiKey: options.apiKey,
      name: "cursor-goal",
      model: options.model,
      local: { cwd: options.cwd },
    })

    return new GoalAgent(agent)
  }

  async checkpoint(options: {
    prompt: string
    idleTimeoutMs: number
    showThinking: boolean
  }): Promise<AgentCheckpointResult> {
    const started = Date.now()
    const run = await this.agent.send(options.prompt)
    const toolCalls = new Set<string>()
    let assistantText = ""

    for await (const event of streamWithIdleTimeout(run, options.idleTimeoutMs)) {
      const rendered = renderSdkEvent(event as SDKMessage, { showThinking: options.showThinking })
      assistantText += rendered.assistantText
      if (rendered.toolCallId) toolCalls.add(rendered.toolCallId)
    }

    const result = await run.wait()
    const usage = (result as { usage?: TokenUsage }).usage ?? {}

    return {
      assistantText,
      decision: parseGoalDecision(assistantText),
      toolCallCount: toolCalls.size,
      usage,
      durationMs: Date.now() - started,
      status: result.status,
    }
  }

  async dispose() {
    const disposable = this.agent as { [Symbol.asyncDispose]?: () => Promise<void> }
    await disposable[Symbol.asyncDispose]?.()
  }
}

async function* streamWithIdleTimeout(run: Awaited<ReturnType<SDKAgentHandle["send"]>>, idleTimeoutMs: number) {
  const iterator = run.stream()[Symbol.asyncIterator]()

  while (true) {
    const next = await nextWithTimeout(iterator.next(), idleTimeoutMs, async () => {
      if (typeof run.supports === "function" && run.supports("cancel")) {
        await run.cancel()
      }
    })

    if (next.done) return
    yield next.value
  }
}

function nextWithTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Promise<void>): Promise<T> {
  let timer: NodeJS.Timeout | undefined

  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      void onTimeout().finally(() => {
        reject(new Error(`No Cursor SDK stream events arrived within ${timeoutMs}ms; cancelled run to avoid a stuck goal.`))
      })
    }, timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}
