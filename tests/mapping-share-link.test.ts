import { describe, expect, it } from "vitest"
import {
  createMappingShareLink,
  readMappingShareLink,
} from "@/lib/mappings/share-link"

describe("mapping share links", () => {
  it("round trips Unicode names and embedding choices", () => {
    const mappings = [
      {
        source: "Futura Com Book",
        replacement: "Example Sans",
        embeddedFont: "Example Sans",
      },
      { source: "Écriture", replacement: "Neue Schrift", embeddedFont: "" },
    ]
    const link = createMappingShareLink(
      mappings,
      "https://example.com/?view=fonts#old"
    )
    const url = new URL(link)
    expect(url.search).toBe("?view=fonts")
    expect(url.hash).toMatch(/^#m=[\w-]+$/)
    expect(readMappingShareLink(url.hash)).toEqual({ kind: "valid", mappings })
  })

  it("rejects invalid, oversized, and mismatched embedding links", () => {
    expect(readMappingShareLink("#other=123")).toBeNull()
    expect(readMappingShareLink("#m=broken!")?.kind).toBe("invalid")
    expect(readMappingShareLink(`#m=${"a".repeat(12_001)}`)?.kind).toBe(
      "invalid"
    )
    const url = createMappingShareLink(
      [{ source: "Arial", replacement: "Example Sans", embeddedFont: "Other" }],
      "https://example.com/"
    )
    expect(readMappingShareLink(new URL(url).hash)?.kind).toBe("invalid")
  })
})
