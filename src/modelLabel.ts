import type { ModelTier, ResolvedModelSummary } from "./types.js"

export function resolveModelLabel(requested: string, tier: ModelTier): ResolvedModelSummary {
  const label = requested.trim()
  const warnings =
    tier === "auto"
      ? []
      : [`Requested tier ${tier}; Cursor chat uses the model selected in the composer.`]

  return {
    requested: label,
    label,
    selection: { id: label },
    source: "exact-id",
    warnings,
  }
}
