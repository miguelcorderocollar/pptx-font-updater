import {
  isValidReplacement,
  normalizeFontFamily,
} from "@/lib/pptx/font-normalization"
import type { SavedMapping } from "@/lib/mappings/saved-mappings"

const PREFIX = "#m="
const MAX_ENCODED_LENGTH = 12_000

export type SharedMappings =
  | { kind: "valid"; mappings: SavedMapping[] }
  | { kind: "invalid"; message: string }
  | null

export function createMappingShareLink(
  mappings: SavedMapping[],
  currentUrl: string
): string {
  if (!mappings.length) throw new Error("Add a mapping before sharing a link.")
  if (mappings.length > 200) {
    throw new Error(
      "These mappings exceed the share-link limit. Export the CSV instead."
    )
  }
  const payload = JSON.stringify({
    version: 1,
    mappings: mappings.map(({ source, replacement, embeddedFont }) => [
      source,
      replacement,
      embeddedFont,
    ]),
  })
  const bytes = new TextEncoder().encode(payload)
  const encoded = btoa(
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error(
      "These mappings exceed the share-link limit. Export the CSV instead."
    )
  }
  const url = new URL(currentUrl)
  url.hash = `m=${encoded}`
  return url.toString()
}

export function readMappingShareLink(hash: string): SharedMappings {
  if (!hash.startsWith(PREFIX)) return null
  const encoded = hash.slice(PREFIX.length)
  if (
    !encoded ||
    encoded.length > MAX_ENCODED_LENGTH ||
    !/^[\w-]+$/.test(encoded)
  ) {
    return {
      kind: "invalid",
      message: "This mapping link is invalid or too long.",
    }
  }
  try {
    const binary = atob(
      encoded
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(encoded.length / 4) * 4, "=")
    )
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    )
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    )
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("mappings" in value) ||
      !Array.isArray(value.mappings) ||
      value.mappings.length === 0 ||
      value.mappings.length > 200
    ) {
      throw new Error("Unsupported mapping link.")
    }
    const mappings: SavedMapping[] = value.mappings.map((row: unknown) => {
      if (
        !Array.isArray(row) ||
        row.length !== 3 ||
        row.some((item) => typeof item !== "string" || item.length > 200)
      ) {
        throw new Error("Invalid mapping row.")
      }
      const [source, replacement, embeddedFont] = row as string[]
      if (
        !isValidReplacement(source) ||
        !isValidReplacement(replacement) ||
        (embeddedFont &&
          normalizeFontFamily(embeddedFont) !==
            normalizeFontFamily(replacement))
      ) {
        throw new Error("Invalid mapping row.")
      }
      return {
        source: source.trim(),
        replacement: replacement.trim(),
        embeddedFont: embeddedFont.trim(),
      }
    })
    return { kind: "valid", mappings }
  } catch {
    return { kind: "invalid", message: "This mapping link could not be read." }
  }
}
