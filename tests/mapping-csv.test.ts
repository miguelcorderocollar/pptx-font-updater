import { describe, expect, it } from "vitest"

import { parseMappingCsv } from "@/lib/mappings/csv"

describe("mapping CSV", () => {
  it("accepts the web and CLI mapping format", () => {
    expect(
      parseMappingCsv(
        "Source, Replacement, embedded_font\nArial,IBM Plex Sans,IBM Plex Sans\nTahoma,Example Sans,"
      )
    ).toEqual([
      {
        source: "Arial",
        replacement: "IBM Plex Sans",
        embeddedFont: "IBM Plex Sans",
      },
      {
        source: "Tahoma",
        replacement: "Example Sans",
        embeddedFont: "",
      },
    ])
  })

  it("rejects duplicate sources and mismatched embedding choices", () => {
    expect(() =>
      parseMappingCsv("source,replacement\nArial,One\n arial ,Two")
    ).toThrow("Duplicate source font")
    expect(() =>
      parseMappingCsv("source,replacement,embedded_font\nArial,One,Other")
    ).toThrow("must match its replacement")
  })
})
