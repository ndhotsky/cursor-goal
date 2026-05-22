import { Cursor, type ModelSelection, type SDKModel } from "@cursor/sdk"
import type { ModelTier, ResolvedModelSummary } from "./types.js"

type SDKModelLoose = SDKModel & {
  variants?: Array<{
    displayName?: string
    description?: string
    params?: Array<{ id: string; value: string }>
  }>
  parameters?: Array<{
    id: string
    displayName?: string
    values: Array<{ value: string; displayName?: string }>
  }>
}

export async function resolveModel(options: {
  apiKey: string
  requested: string
  tier: ModelTier
}): Promise<ResolvedModelSummary> {
  const models = (await Cursor.models.list({ apiKey: options.apiKey })) as SDKModelLoose[]
  const requested = options.requested.trim()
  const exact = models.find((model) => model.id === requested)
  const display = exact ?? models.find((model) => (model.displayName ?? "").toLowerCase() === requested.toLowerCase())
  const normalized = display ?? models.find((model) => normalize(model.id) === normalize(requested) || normalize(model.displayName ?? "") === normalize(requested))
  const composerFallback = normalized ?? findComposer25(models)
  const model = composerFallback

  if (!model) {
    const available = models.map((item) => `${item.id}${item.displayName ? ` (${item.displayName})` : ""}`).join("\n  - ")
    throw new Error(`Could not find model ${requested}. Available models:\n  - ${available}`)
  }

  const warnings: string[] = []
  const selection = selectVariant(model, options.tier, warnings)
  const label = formatModelLabel(model, selection)

  return {
    requested,
    label,
    selection,
    source: exact ? "exact-id" : display ? "display-name" : normalized ? "normalized" : "fallback",
    warnings,
  }
}

export function pickVariantParams(model: SDKModelLoose, tier: ModelTier): Array<{ id: string; value: string }> | undefined {
  return selectVariant(model, tier, []).params
}

function findComposer25(models: SDKModelLoose[]) {
  return models.find((model) => {
    const haystack = `${model.id} ${model.displayName ?? ""}`.toLowerCase()
    return haystack.includes("composer") && haystack.includes("2.5")
  })
}

function selectVariant(model: SDKModelLoose, tier: ModelTier, warnings: string[]): ModelSelection {
  if (tier === "auto") {
    return { id: model.id }
  }

  const variants = model.variants ?? []
  const variant = variants.find((item) => variantMatches(item, tier))

  if (!variant?.params?.length) {
    warnings.push(`Requested tier ${tier}, but no matching model variant was exposed by Cursor.models.list(); using model default.`)
    return { id: model.id }
  }

  return { id: model.id, params: variant.params }
}

function variantMatches(variant: { displayName?: string; params?: Array<{ id: string; value: string }> }, tier: ModelTier) {
  const haystack = [
    variant.displayName,
    ...(variant.params ?? []).flatMap((param) => [param.id, param.value]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return haystack.includes(tier)
}

function formatModelLabel(model: SDKModelLoose, selection: ModelSelection) {
  if (!selection.params?.length) {
    return model.displayName || model.id
  }

  const params = selection.params.map((param) => `${param.id}=${param.value}`).join(",")
  return `${model.displayName || model.id} (${params})`
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}
