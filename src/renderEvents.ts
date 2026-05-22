import type { SDKMessage } from "@cursor/sdk"

export type RenderedEvent = {
  assistantText: string
  toolCallId?: string
}

export function renderSdkEvent(event: SDKMessage, options: { showThinking: boolean }): RenderedEvent {
  switch (event.type) {
    case "assistant": {
      let text = ""
      for (const block of event.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text)
          text += block.text
        } else {
          const name = String((block as { name?: unknown }).name ?? "tool")
          const id = String((block as { id?: unknown }).id ?? name)
          console.log(`\n[tool requested] ${name}`)
          return { assistantText: text, toolCallId: id }
        }
      }
      return { assistantText: text }
    }
    case "thinking":
      if (options.showThinking) {
        process.stdout.write(event.text)
      }
      return { assistantText: "" }
    case "tool_call":
      console.log(`\n[tool ${event.status}] ${event.name}`)
      return { assistantText: "", toolCallId: event.call_id }
    case "status":
      if (event.message) console.log(`\n[status] ${event.status}: ${event.message}`)
      else console.log(`\n[status] ${event.status}`)
      return { assistantText: "" }
    case "task":
      if (event.text) console.log(`\n[task] ${event.status ?? ""} ${event.text}`.trim())
      return { assistantText: "" }
    default:
      return { assistantText: "" }
  }
}
