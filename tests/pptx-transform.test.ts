import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import JSZip from "jszip"
import { describe, expect, it } from "vitest"

import { parseFontFace } from "@/lib/fonts/font-metadata"
import { inspectPptx } from "@/lib/pptx/inspect"
import { normalizeFontFamily } from "@/lib/pptx/font-normalization"
import { transformPptx } from "@/lib/pptx/transform"

const fixturePath = fileURLToPath(
  new URL("./fixtures/generated-sample.pptx", import.meta.url)
)
const fontPath = fileURLToPath(
  new URL("./fixtures/fonts/IBMPlexSans-Regular.ttf", import.meta.url)
)

async function fixtureBuffer(path: string): Promise<ArrayBuffer> {
  const buffer = await readFile(path)
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
}

describe("PPTX inspection and transformation", () => {
  it("finds fonts across the generated sample presentation", async () => {
    const source = await fixtureBuffer(fixturePath)
    const inspected = await inspectPptx(source, "Generated_Sample.pptx")

    expect(inspected.summary.slideCount).toBe(3)
    expect(inspected.summary.packagePartCount).toBeGreaterThan(30)
    expect(inspected.summary.themeTokens.length).toBeGreaterThan(0)
    expect(
      inspected.summary.families.find(
        (family) => family.normalizedName === "arial"
      )
    ).toMatchObject({
      displayName: "Arial",
      referenceCount: 39,
    })
    expect(inspected.summary.embeddedFonts).toEqual([])
  })

  it("changes exact family references while leaving theme tokens intact", async () => {
    const source = await fixtureBuffer(fixturePath)
    const inspected = await inspectPptx(source, "Generated_Sample.pptx")
    const beforeTokens = inspected.summary.themeTokens
    const result = await transformPptx(
      inspected.zip,
      inspected.summary.fileName,
      {
        mappings: [{ source: "Arial", replacement: "IBM Plex Sans" }],
        confirmEmbeddingRights: false,
        confirmPreviewPrint: false,
      }
    )
    const transformed = await inspectPptx(result.output, "transformed.pptx")

    expect(result.report.changedReferences).toBe(39)
    expect(result.report.changedParts).toBeGreaterThan(0)
    expect(
      transformed.summary.families.some(
        (family) => family.normalizedName === "arial"
      )
    ).toBe(false)
    expect(
      transformed.summary.families.find(
        (family) => family.normalizedName === "ibm plex sans"
      )?.referenceCount
    ).toBe(39)
    expect(transformed.summary.themeTokens).toEqual(beforeTokens)
  })

  it("lists and replaces a font used only by a theme", async () => {
    const source = await fixtureBuffer(fixturePath)
    const sourceZip = await JSZip.loadAsync(source)
    const themePath = "ppt/theme/theme1.xml"
    const theme = await sourceZip.file(themePath)!.async("text")
    sourceZip.file(
      themePath,
      theme.replaceAll('typeface="Calibri Light"', 'typeface="Theme Only Font"')
    )
    const modified = await sourceZip.generateAsync({ type: "arraybuffer" })
    const inspected = await inspectPptx(modified, "theme-font.pptx")
    expect(
      inspected.summary.families.find(
        (family) => family.normalizedName === "theme only font"
      )
    ).toMatchObject({ categories: { theme: 3 }, referenceCount: 3 })

    const result = await transformPptx(inspected.zip, "theme-font.pptx", {
      mappings: [{ source: "Theme Only Font", replacement: "IBM Plex Sans" }],
      confirmEmbeddingRights: false,
      confirmPreviewPrint: false,
    })
    const transformed = await inspectPptx(result.output, "transformed.pptx")
    expect(result.report.changedReferences).toBe(3)
    expect(
      transformed.summary.families.some(
        (family) => family.normalizedName === "theme only font"
      )
    ).toBe(false)
    const outputZip = await JSZip.loadAsync(result.output)
    expect(await outputZip.file(themePath)!.async("text")).toContain(
      'typeface="IBM Plex Sans"'
    )
  })

  it("embeds an uploaded static font as PowerPoint fntdata", async () => {
    const [source, fontBuffer] = await Promise.all([
      fixtureBuffer(fixturePath),
      fixtureBuffer(fontPath),
    ])
    const inspected = await inspectPptx(source, "Generated_Sample.pptx")
    const face = await parseFontFace("IBMPlexSans-Regular.ttf", fontBuffer)
    const familyId = normalizeFontFamily(face.summary.family)
    const result = await transformPptx(
      inspected.zip,
      inspected.summary.fileName,
      {
        mappings: [
          {
            source: "Arial",
            replacement: face.summary.family,
            embeddedFamilyId: familyId,
          },
        ],
        confirmEmbeddingRights: true,
        confirmPreviewPrint: true,
      },
      new Map([[familyId, [face]]])
    )

    const zip = await JSZip.loadAsync(result.output, { checkCRC32: true })
    const fontParts = Object.keys(zip.files).filter((path) =>
      path.endsWith(".fntdata")
    )
    const presentation = await zip.file("ppt/presentation.xml")!.async("text")
    const relationships = await zip
      .file("ppt/_rels/presentation.xml.rels")!
      .async("text")
    const contentTypes = await zip.file("[Content_Types].xml")!.async("text")
    const payload = await zip.file(fontParts[0])!.async("arraybuffer")
    const payloadView = new DataView(payload)

    expect(face.summary.embeddable).toBe(true)
    expect(fontParts).toHaveLength(1)
    expect(payloadView.getUint32(0, true)).toBe(payload.byteLength)
    expect(payloadView.getUint16(34, true)).toBe(0x504c)
    expect(presentation).toContain('embedTrueTypeFonts="1"')
    expect(presentation).toContain('saveSubsetFonts="0"')
    expect(presentation).toContain(`typeface="${face.summary.family}"`)
    expect(relationships).toContain("relationships/font")
    expect(contentTypes).toContain("application/x-fontdata")
    expect(result.report.embeddedFamilies).toEqual([face.summary.family])

    const reinspected = await inspectPptx(result.output, "embedded.pptx")
    expect(reinspected.summary.embeddedFonts).toEqual([
      expect.objectContaining({
        displayName: face.summary.family,
        slots: ["regular"],
      }),
    ])
  })

  it("embeds a shared replacement family once", async () => {
    const [source, fontBuffer] = await Promise.all([
      fixtureBuffer(fixturePath),
      fixtureBuffer(fontPath),
    ])
    const inspected = await inspectPptx(source, "shared-font.pptx")
    const face = await parseFontFace("IBMPlexSans-Regular.ttf", fontBuffer)
    const familyId = normalizeFontFamily(face.summary.family)
    const result = await transformPptx(
      inspected.zip,
      "shared-font.pptx",
      {
        mappings: [
          {
            source: "Arial",
            replacement: face.summary.family,
            embeddedFamilyId: familyId,
          },
          {
            source: "Calibri",
            replacement: face.summary.family,
            embeddedFamilyId: familyId,
          },
        ],
        confirmEmbeddingRights: true,
        confirmPreviewPrint: true,
      },
      new Map([[familyId, [face]]])
    )

    const zip = await JSZip.loadAsync(result.output, { checkCRC32: true })
    expect(
      Object.keys(zip.files).filter((path) => path.endsWith(".fntdata"))
    ).toHaveLength(1)
    expect(result.report.embeddedFamilies).toEqual([face.summary.family])
  })
})
