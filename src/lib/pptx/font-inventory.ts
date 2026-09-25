import type JSZip from "jszip"

import { isThemeToken, normalizeFontFamily } from "./font-normalization"
import { xmlPartPaths } from "./package-preflight"
import type {
  EmbeddedFontSummary,
  FontCategory,
  FontFamilySummary,
  InspectionSummary,
} from "./types"
import {
  descendants,
  getAttributeByLocalName,
  hasAncestor,
  parseXml,
} from "./xml"

const MAX_XML_CHARS = 20 * 1024 * 1024

function categoryForPath(path: string): FontCategory {
  if (path.startsWith("ppt/theme/")) return "theme"
  if (path === "ppt/presentation.xml") return "presentation"
  if (path.startsWith("ppt/slideMasters/")) return "master"
  if (path.startsWith("ppt/slideLayouts/")) return "layout"
  if (path.startsWith("ppt/slides/")) return "slide"
  if (path.startsWith("ppt/notes")) return "notes"
  if (path.startsWith("ppt/charts/")) return "chart"
  if (path.startsWith("ppt/diagrams/")) return "diagram"
  if (path.startsWith("ppt/drawings/")) return "drawing"
  return "other"
}

type MutableFamily = FontFamilySummary & {
  samplePartSet: Set<string>
  themePrimary: boolean
}

export async function inspectPackage(
  zip: JSZip,
  fileName: string,
  fileSize: number,
  onPartChecked?: (completed: number, total: number) => void
): Promise<InspectionSummary> {
  const families = new Map<string, MutableFamily>()
  const tokens = new Map<string, number>()
  const embedded = new Map<string, EmbeddedFontSummary>()
  const paths = xmlPartPaths(zip)
  let completed = 0
  onPartChecked?.(0, paths.length)

  await Promise.all(
    paths.map(async (path) => {
      try {
        const xml = await zip.file(path)!.async("text")
        if (xml.length > MAX_XML_CHARS)
          throw new Error(`${path} exceeds the XML part limit.`)
        if (!xml.includes("typeface")) return
        const document = parseXml(xml, path)

        for (const element of descendants(document)) {
          const attribute = getAttributeByLocalName(element, "typeface")
          const value = attribute?.value.trim() ?? ""
          if (!value) continue

          if (hasAncestor(element, "embeddedFont")) {
            const normalizedName = normalizeFontFamily(value)
            const record = embedded.get(normalizedName) ?? {
              displayName: value,
              normalizedName,
              slots: [],
            }
            const embeddedFont = element.parentNode
            if (embeddedFont) {
              record.slots = Array.from(
                new Set(
                  Array.from(
                    { length: embeddedFont.childNodes.length },
                    (_, index) => embeddedFont.childNodes.item(index)
                  )
                    .filter((node): node is Element => node?.nodeType === 1)
                    .map((node) => node.localName)
                    .filter((name) =>
                      ["regular", "bold", "italic", "boldItalic"].includes(name)
                    )
                )
              )
            }
            embedded.set(normalizedName, record)
            continue
          }

          if (isThemeToken(value)) {
            tokens.set(value, (tokens.get(value) ?? 0) + 1)
            continue
          }

          const normalizedName = normalizeFontFamily(value)
          const category = categoryForPath(path)
          const record = families.get(normalizedName) ?? {
            displayName: value,
            normalizedName,
            referenceCount: 0,
            categories: {},
            sampleParts: [],
            samplePartSet: new Set<string>(),
            themePrimary: false,
          }
          record.referenceCount += 1
          record.categories[category] = (record.categories[category] ?? 0) + 1
          if (
            category === "theme" &&
            element.localName === "latin" &&
            ["majorFont", "minorFont"].includes(
              (element.parentNode as Element | null)?.localName ?? ""
            )
          ) {
            record.themePrimary = true
          }
          if (record.samplePartSet.size < 3) record.samplePartSet.add(path)
          families.set(normalizedName, record)
        }
      } finally {
        onPartChecked?.(++completed, paths.length)
      }
    })
  )

  const familySummaries = Array.from(families.values())
    .filter(
      (family) =>
        family.themePrimary ||
        Object.keys(family.categories).some((category) => category !== "theme")
    )
    .map((family) => ({
      displayName: family.displayName,
      normalizedName: family.normalizedName,
      referenceCount: family.referenceCount,
      categories: family.categories,
      sampleParts: Array.from(family.samplePartSet),
    }))
    .sort(
      (a, b) =>
        b.referenceCount - a.referenceCount ||
        a.displayName.localeCompare(b.displayName)
    )

  return {
    fileName,
    fileSize,
    packagePartCount: Object.keys(zip.files).length,
    slideCount: Object.keys(zip.files).filter((path) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(path)
    ).length,
    xmlPartCount: paths.length,
    referenceCount: familySummaries.reduce(
      (total, family) => total + family.referenceCount,
      0
    ),
    families: familySummaries,
    themeTokens: Array.from(tokens, ([name, referenceCount]) => ({
      name,
      referenceCount,
    })).sort((a, b) => b.referenceCount - a.referenceCount),
    embeddedFonts: Array.from(embedded.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    ),
  }
}
