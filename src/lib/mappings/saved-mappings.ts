import { normalizeFontFamily } from "@/lib/pptx/font-normalization"

const STORAGE_KEY = "pptx-font-updater:mappings:v1"

export type SavedMapping = {
  source: string
  replacement: string
  embeddedFont: string
}

export function mergeSavedMappings(
  current: SavedMapping[],
  incoming: SavedMapping[]
): SavedMapping[] {
  const bySource = new Map(
    current.map((mapping) => [normalizeFontFamily(mapping.source), mapping])
  )
  for (const mapping of incoming) {
    const source = mapping.source.trim()
    const replacement = mapping.replacement.trim()
    if (!source) continue
    if (!replacement) {
      bySource.delete(normalizeFontFamily(source))
      continue
    }
    bySource.set(normalizeFontFamily(source), {
      source,
      replacement,
      embeddedFont: mapping.embeddedFont.trim(),
    })
  }
  return Array.from(bySource.values())
}

export function loadSavedMappings(): SavedMapping[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return mergeSavedMappings(
      [],
      parsed.filter(
        (item): item is SavedMapping =>
          typeof item === "object" &&
          item !== null &&
          typeof item.source === "string" &&
          typeof item.replacement === "string" &&
          typeof item.embeddedFont === "string"
      )
    )
  } catch {
    return []
  }
}

export function saveSavedMappings(mappings: SavedMapping[]): void {
  if (typeof localStorage === "undefined") return
  if (mappings.length === 0) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings))
}
