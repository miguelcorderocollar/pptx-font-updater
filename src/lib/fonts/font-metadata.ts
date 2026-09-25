import { Font } from "fonteditor-core"

import { normalizeFontFamily } from "@/lib/pptx/font-normalization"
import type {
  EmbeddingPermission,
  FontFaceSlot,
  FontFaceSummary,
  FontFamilyUploadSummary,
  FontImportResult,
} from "@/lib/pptx/types"

export type ParsedFontFace = {
  summary: FontFaceSummary
  source: ArrayBuffer
  sourceType: "ttf" | "otf"
}

function fontTypeFromName(fileName: string): "ttf" | "otf" | null {
  const extension = fileName.toLocaleLowerCase("en-US").split(".").pop()
  return extension === "ttf" || extension === "otf" ? extension : null
}

function hasSfntTable(buffer: ArrayBuffer, tag: string): boolean {
  if (buffer.byteLength < 12) return false
  const view = new DataView(buffer)
  const count = view.getUint16(4, false)
  if (count > 100 || 12 + count * 16 > buffer.byteLength) return false
  for (let index = 0; index < count; index += 1) {
    const offset = 12 + index * 16
    const current = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    )
    if (current === tag) return true
  }
  return false
}

function permissionForFsType(fsType: number): EmbeddingPermission {
  if ((fsType & 0x0200) !== 0) return "bitmap-only"
  const usage = fsType & 0x000f
  if (usage === 0x0002) return "restricted"
  if (usage === 0x0004) return "preview-print"
  if (usage === 0x0008) return "editable"
  return "installable"
}

function faceSlot(subfamily: string, italic: boolean): FontFaceSlot {
  const bold = /\b(bold|black|heavy|semibold|demibold)\b/i.test(subfamily)
  if (bold && italic) return "boldItalic"
  if (bold) return "bold"
  if (italic) return "italic"
  return "regular"
}

async function digestId(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export async function parseFontFace(
  fileName: string,
  buffer: ArrayBuffer
): Promise<ParsedFontFace> {
  if (buffer.byteLength === 0) throw new Error("The font file is empty.")
  if (buffer.byteLength > 30 * 1024 * 1024)
    throw new Error("The font exceeds the 30 MB face limit.")

  const sourceType = fontTypeFromName(fileName)
  if (!sourceType) throw new Error("Only TTF and OTF files are supported.")

  const font = Font.create(buffer, {
    type: sourceType,
    hinting: true,
    kerning: true,
    compound2simple: false,
  })
  const data = font.get()
  const family = data.name.fontFamily?.trim()
  if (!family) throw new Error("The font has no readable internal family name.")

  const subfamily = data.name.fontSubFamily?.trim() || "Regular"
  const os2 = data["OS/2"]
  if (!os2) throw new Error("The font has no OS/2 table.")
  const italic =
    (os2.fsSelection & 0x0001) !== 0 || /italic|oblique/i.test(subfamily)
  const permission = permissionForFsType(os2.fsType)
  const variable = hasSfntTable(buffer, "fvar")
  const embeddable =
    !variable && permission !== "restricted" && permission !== "bitmap-only"
  const issue = variable
    ? "Variable fonts are not embedded in version one. Add a static face instead."
    : permission === "restricted"
      ? "The font declares Restricted License embedding."
      : permission === "bitmap-only"
        ? "The font permits bitmap embedding only."
        : undefined

  const normalizedFamily = normalizeFontFamily(family)
  return {
    source: buffer,
    sourceType,
    summary: {
      id: await digestId(buffer),
      fileName,
      family,
      normalizedFamily,
      subfamily,
      slot: faceSlot(subfamily, italic),
      weight: os2.usWeightClass,
      italic,
      permission,
      embeddable,
      variable,
      size: buffer.byteLength,
      issue,
    },
  }
}

const permissionRank: Record<EmbeddingPermission, number> = {
  installable: 0,
  editable: 1,
  "preview-print": 2,
  restricted: 3,
  "bitmap-only": 4,
}

export function summarizeFontLibrary(
  faces: Iterable<ParsedFontFace>,
  rejected: FontImportResult["rejected"] = []
): FontImportResult {
  const grouped = new Map<string, ParsedFontFace[]>()
  for (const face of faces) {
    const list = grouped.get(face.summary.normalizedFamily) ?? []
    list.push(face)
    grouped.set(face.summary.normalizedFamily, list)
  }

  const families: FontFamilyUploadSummary[] = Array.from(
    grouped.values(),
    (group) => {
      const ranked = [...group].sort((a, b) => {
        const rank = (face: ParsedFontFace) =>
          (face.summary.embeddable ? 0 : 10) +
          (face.sourceType === "ttf" ? 0 : 1)
        return (
          rank(a) - rank(b) ||
          a.summary.fileName.localeCompare(b.summary.fileName)
        )
      })
      const first = ranked[0].summary
      const slots: FontFamilyUploadSummary["faces"] = {}
      const issues: string[] = []
      for (const face of ranked) {
        if (!slots[face.summary.slot]) {
          slots[face.summary.slot] = face.summary
        }
        if (face.summary.issue)
          issues.push(`${face.summary.fileName}: ${face.summary.issue}`)
      }
      if (!slots.regular)
        issues.push(
          "A regular face is required before this family can be embedded."
        )

      const selected = Object.values(slots)
      const permission = selected
        .map((face) => face!.permission)
        .sort((a, b) => permissionRank[b] - permissionRank[a])[0]
      return {
        id: first.normalizedFamily,
        family: first.family,
        normalizedFamily: first.normalizedFamily,
        permission,
        embeddable:
          Boolean(slots.regular) && selected.every((face) => face!.embeddable),
        faces: slots,
        issues: Array.from(new Set(issues)),
      }
    }
  ).sort((a, b) => a.family.localeCompare(b.family))

  return { families, rejected }
}

export function fontFaceToEot(face: ParsedFontFace): ArrayBuffer {
  if (!face.summary.embeddable)
    throw new Error(`${face.summary.family} cannot be embedded.`)
  const font = Font.create(face.source.slice(0), {
    type: face.sourceType,
    hinting: true,
    kerning: true,
    compound2simple: false,
  })
  const output = font.write({
    type: "eot",
    hinting: true,
    kerning: true,
    toBuffer: false,
  })
  if (!(output instanceof ArrayBuffer))
    throw new Error("The EOT converter returned an invalid payload.")
  validateEot(output)
  return output
}

export function validateEot(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 82)
    throw new Error("The generated EOT payload is too small.")
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== buffer.byteLength) {
    throw new Error("The generated EOT size header is invalid.")
  }
  if (view.getUint16(34, true) !== 0x504c) {
    throw new Error("The generated EOT magic number is invalid.")
  }
}
