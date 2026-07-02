export function truncateText(value: string, max: number) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`
}

export function clipInline(value: string, max: number) {
  const trimmed = value.replace(/\s+/g, " ").trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`
}

export function tailText(value: string, max: number) {
  return value.length <= max ? value : value.slice(value.length - max)
}

export function redactHome(value: string) {
  const home = process.env.HOME
  if (home && (value === home || value.startsWith(`${home}/`))) {
    return `~${value.slice(home.length)}`
  }
  return value
}
