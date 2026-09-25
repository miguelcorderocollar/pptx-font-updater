import { describe, expect, it } from "vitest"

import {
  isThemeToken,
  isValidReplacement,
  normalizeFontFamily,
} from "@/lib/pptx/font-normalization"

describe("font family normalization", () => {
  it("matches family names case-insensitively without fuzzy aliases", () => {
    expect(normalizeFontFamily("  FUTURA Com ")).toBe("futura com")
    expect(normalizeFontFamily("Futura for Example Sans Book")).not.toBe(
      normalizeFontFamily("Futura Com")
    )
  })

  it("recognizes Office theme references", () => {
    expect(isThemeToken("+mn-lt")).toBe(true)
    expect(isThemeToken("+MJ-EA")).toBe(true)
    expect(isThemeToken("Arial")).toBe(false)
  })

  it("rejects empty and control-character replacements", () => {
    expect(isValidReplacement("IBM Plex Sans")).toBe(true)
    expect(isValidReplacement("   ")).toBe(false)
    expect(isValidReplacement("Bad\nName")).toBe(false)
  })
})
