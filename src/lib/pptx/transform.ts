import JSZip from "jszip"

import type { ParsedFontFace } from "@/lib/fonts/font-metadata"

import { embedMappedFonts } from "./embedded-fonts"
import {
  isThemeToken,
  isValidReplacement,
  normalizeFontFamily,
} from "./font-normalization"
import { inspectPackage } from "./font-inventory"
import { xmlPartPaths } from "./package-preflight"
import type { FontMapping, TransformReport, TransformRequest } from "./types"
import {
  descendants,
  elementChildren,
  getAttributeByLocalName,
  hasAncestor,
  parseXml,
  serializeXml,
} from "./xml"

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"

export type TransformResult = {
  output: ArrayBuffer
  report: TransformReport
}

export async function transformPptx(
  sourceZip: JSZip,
  fileName: string,
  request: TransformRequest,
  fontFamilies: Map<string, ParsedFontFace[]> = new Map()
): Promise<TransformResult> {
  const zip = await JSZip.loadAsync(
    await sourceZip.generateAsync({ type: "arraybuffer" })
  )
  const mappings = new Map<string, FontMapping>()
  for (const mapping of request.mappings) {
    if (!isValidReplacement(mapping.replacement)) continue
    mappings.set(normalizeFontFamily(mapping.source), {
      ...mapping,
      source: mapping.source.trim(),
      replacement: mapping.replacement.trim(),
    })
  }
  if (mappings.size === 0)
    throw new Error(
      "Add at least one valid font mapping before generating a file."
    )

  const selectedEmbeddedFamilies = Array.from(mappings.values()).filter(
    (mapping) => mapping.embeddedFamilyId
  )
  if (selectedEmbeddedFamilies.length > 0 && !request.confirmEmbeddingRights) {
    throw new Error(
      "Confirm that you have permission to embed the selected font files."
    )
  }
  for (const mapping of selectedEmbeddedFamilies) {
    const faces = fontFamilies.get(mapping.embeddedFamilyId!) ?? []
    if (
      faces.find((face) => face.summary.slot === "regular")?.summary
        .permission === "preview-print" &&
      !request.confirmPreviewPrint
    ) {
      throw new Error(
        "Confirm the Preview & Print restriction before embedding this font."
      )
    }
  }

  let changedReferences = 0
  let changedParts = 0
  for (const path of xmlPartPaths(zip)) {
    const entry = zip.file(path)
    if (!entry) continue
    const xml = await entry.async("text")
    if (!xml.includes("typeface")) continue
    const document = parseXml(xml, path)
    const themeSchemes = descendants(document)
      .filter((element) => element.localName === "fontScheme")
      .map((scheme) => {
        const typeface = (kind: string) => {
          const group = elementChildren(scheme).find(
            (element) => element.localName === kind
          )
          const latin =
            group &&
            elementChildren(group).find(
              (element) => element.localName === "latin"
            )
          return latin
            ? getAttributeByLocalName(latin, "typeface")?.value
            : undefined
        }
        return {
          scheme,
          major: typeface("majorFont"),
          minor: typeface("minorFont"),
        }
      })
    let partChanged = false
    for (const element of descendants(document)) {
      if (hasAncestor(element, "embeddedFont")) continue
      const attribute = getAttributeByLocalName(element, "typeface")
      if (!attribute || isThemeToken(attribute.value)) continue
      const mapping = mappings.get(normalizeFontFamily(attribute.value))
      if (!mapping || attribute.value === mapping.replacement) continue
      attribute.value = mapping.replacement
      changedReferences += 1
      partChanged = true
    }
    for (const { scheme, major, minor } of themeSchemes) {
      if (
        !major ||
        !minor ||
        scheme.getAttribute("name") !== `${major} & ${minor}`
      )
        continue
      const replacementMajor =
        mappings.get(normalizeFontFamily(major))?.replacement ?? major
      const replacementMinor =
        mappings.get(normalizeFontFamily(minor))?.replacement ?? minor
      if (replacementMajor === major && replacementMinor === minor) continue
      scheme.setAttribute("name", `${replacementMajor} & ${replacementMinor}`)
      partChanged = true
    }
    if (partChanged) {
      zip.file(path, serializeXml(document))
      changedParts += 1
    }
  }

  const embedded = await embedMappedFonts(
    zip,
    Array.from(mappings.values()),
    fontFamilies
  )

  const output = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: PPTX_MIME,
  })
  const validated = await JSZip.loadAsync(output, { checkCRC32: true })
  await inspectPackage(validated, fileName, output.byteLength)

  return {
    output,
    report: {
      changedReferences,
      changedParts,
      embeddedFamilies: embedded.embeddedFamilies,
      removedEmbeddedFamilies: embedded.removedEmbeddedFamilies,
      warnings: embedded.warnings,
      outputSize: output.byteLength,
    },
  }
}
