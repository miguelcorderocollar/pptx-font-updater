import Papa from "papaparse"

import {
  isValidReplacement,
  normalizeFontFamily,
} from "@/lib/pptx/font-normalization"
import type { SavedMapping } from "./saved-mappings"

export function parseMappingCsv(csv: string): SavedMapping[] {
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: true,
  })
  const headers = (parsed.meta.fields ?? []).map((field) =>
    field.trim().toLowerCase()
  )
  if (
    !headers.includes("source") ||
    !headers.includes("replacement") ||
    parsed.errors.length
  ) {
    throw new Error(
      "Use CSV columns source,replacement,embedded_font. The last column is optional."
    )
  }

  const seen = new Set<string>()
  return parsed.data.map((item, index) => {
    const fields = Object.fromEntries(
      Object.entries(item).map(([key, value]) => [
        key.trim().toLowerCase(),
        value?.trim() ?? "",
      ])
    )
    const source = fields.source ?? ""
    const replacement = fields.replacement ?? ""
    const embeddedFont = fields.embedded_font ?? ""
    if (!isValidReplacement(source)) {
      throw new Error(`Row ${index + 2} needs a valid source font name.`)
    }
    if (replacement && !isValidReplacement(replacement)) {
      throw new Error(`Row ${index + 2} has an invalid replacement font name.`)
    }
    if (
      embeddedFont &&
      normalizeFontFamily(embeddedFont) !== normalizeFontFamily(replacement)
    ) {
      throw new Error(
        `The embedded font for "${source}" must match its replacement family.`
      )
    }
    const normalized = normalizeFontFamily(source)
    if (seen.has(normalized)) {
      throw new Error(`Duplicate source font in CSV: ${source}.`)
    }
    seen.add(normalized)
    return { source, replacement, embeddedFont }
  })
}
