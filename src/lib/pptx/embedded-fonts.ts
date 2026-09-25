import type JSZip from "jszip"

import { fontFaceToEot, type ParsedFontFace } from "@/lib/fonts/font-metadata"

import { normalizeFontFamily } from "./font-normalization"
import type { FontFaceSlot, FontMapping } from "./types"
import {
  descendants,
  elementChildren,
  getAttributeByLocalName,
  parseXml,
  serializeXml,
} from "./xml"

const PRESENTATION_NS =
  "http://schemas.openxmlformats.org/presentationml/2006/main"
const RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships"
const CONTENT_TYPE_NS =
  "http://schemas.openxmlformats.org/package/2006/content-types"
const FONT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font"
const FONT_CONTENT_TYPE = "application/x-fontdata"

type EmbedResult = {
  embeddedFamilies: string[]
  removedEmbeddedFamilies: string[]
  warnings: string[]
}

function normalizePackagePath(path: string): string {
  const parts: string[] = []
  for (const part of path.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return parts.join("/")
}

function targetPath(target: string): string {
  return normalizePackagePath(`ppt/${target}`)
}

function nextRelationshipId(existing: Set<string>): string {
  let index = 1
  while (existing.has(`rId${index}`)) index += 1
  const value = `rId${index}`
  existing.add(value)
  return value
}

function nextFontPartName(zip: JSZip, reserved: Set<string>): string {
  let index = 1
  while (
    zip.file(`ppt/fonts/font${index}.fntdata`) ||
    reserved.has(`ppt/fonts/font${index}.fntdata`)
  ) {
    index += 1
  }
  const value = `ppt/fonts/font${index}.fntdata`
  reserved.add(value)
  return value
}

function removeEmbeddedFamily(
  zip: JSZip,
  embeddedList: Element,
  relDocument: Document,
  familyNames: Set<string>
): string[] {
  const removed: string[] = []
  const relsToRemove = new Set<string>()

  for (const embeddedElement of elementChildren(embeddedList)) {
    if (embeddedElement.localName !== "embeddedFont") continue
    const fontElement = elementChildren(embeddedElement).find(
      (element) => element.localName === "font"
    )
    const typeface = fontElement
      ? getAttributeByLocalName(fontElement, "typeface")?.value
      : undefined
    if (!typeface || !familyNames.has(normalizeFontFamily(typeface))) continue

    for (const child of elementChildren(embeddedElement)) {
      if (
        !["regular", "bold", "italic", "boldItalic"].includes(child.localName)
      )
        continue
      const id = getAttributeByLocalName(child, "id")?.value
      if (id) relsToRemove.add(id)
    }
    embeddedList.removeChild(embeddedElement)
    removed.push(typeface)
  }

  const removedTargets: string[] = []
  for (const relationship of descendants(relDocument)) {
    if (relationship.localName !== "Relationship") continue
    const id = relationship.getAttribute("Id")
    if (!id || !relsToRemove.has(id)) continue
    const target = relationship.getAttribute("Target")
    if (target) removedTargets.push(targetPath(target))
    relationship.parentNode?.removeChild(relationship)
  }

  const remainingTargets = new Set(
    descendants(relDocument)
      .filter((element) => element.localName === "Relationship")
      .map((element) => element.getAttribute("Target"))
      .filter((target): target is string => Boolean(target))
      .map(targetPath)
  )
  for (const path of removedTargets) {
    if (!remainingTargets.has(path)) zip.remove(path)
  }

  return removed
}

export async function embedMappedFonts(
  zip: JSZip,
  mappings: FontMapping[],
  fontFamilies: Map<string, ParsedFontFace[]>
): Promise<EmbedResult> {
  const selectedMappings = mappings.filter(
    (mapping) => mapping.embeddedFamilyId
  )
  const selected = Array.from(
    new Map(
      selectedMappings.map((mapping) => [mapping.embeddedFamilyId!, mapping])
    ).values()
  )
  if (selected.length === 0)
    return { embeddedFamilies: [], removedEmbeddedFamilies: [], warnings: [] }

  const presentationPath = "ppt/presentation.xml"
  const relsPath = "ppt/_rels/presentation.xml.rels"
  const contentTypesPath = "[Content_Types].xml"
  const presentationDocument = parseXml(
    await zip.file(presentationPath)!.async("text"),
    presentationPath
  )
  const relDocument = parseXml(
    await zip.file(relsPath)!.async("text"),
    relsPath
  )
  const contentTypesDocument = parseXml(
    await zip.file(contentTypesPath)!.async("text"),
    contentTypesPath
  )
  const presentation = presentationDocument.documentElement
  presentation.setAttribute("embedTrueTypeFonts", "1")
  presentation.setAttribute("saveSubsetFonts", "0")

  let embeddedList = descendants(presentationDocument).find(
    (element) => element.localName === "embeddedFontLst"
  )
  if (!embeddedList) {
    embeddedList = presentationDocument.createElementNS(
      PRESENTATION_NS,
      "p:embeddedFontLst"
    )
    const defaultTextStyle = elementChildren(presentation).find(
      (element) => element.localName === "defaultTextStyle"
    )
    presentation.insertBefore(embeddedList, defaultTextStyle ?? null)
  }

  const relationshipRoot = relDocument.documentElement
  const relationshipIds = new Set(
    descendants(relDocument)
      .filter((element) => element.localName === "Relationship")
      .map((element) => element.getAttribute("Id"))
      .filter((id): id is string => Boolean(id))
  )
  const reservedParts = new Set<string>()
  const embeddedFamilies: string[] = []
  const removedEmbeddedFamilies: string[] = []
  const warnings: string[] = []

  const replacedNames = new Set(
    selectedMappings.flatMap((mapping) => [
      normalizeFontFamily(mapping.source),
      normalizeFontFamily(mapping.replacement),
    ])
  )
  removedEmbeddedFamilies.push(
    ...removeEmbeddedFamily(zip, embeddedList, relDocument, replacedNames)
  )

  const defaultExists = descendants(contentTypesDocument).some(
    (element) =>
      element.localName === "Default" &&
      element.getAttribute("Extension")?.toLocaleLowerCase("en-US") ===
        "fntdata"
  )
  if (!defaultExists) {
    const defaultElement = contentTypesDocument.createElementNS(
      CONTENT_TYPE_NS,
      "Default"
    )
    defaultElement.setAttribute("Extension", "fntdata")
    defaultElement.setAttribute("ContentType", FONT_CONTENT_TYPE)
    contentTypesDocument.documentElement.appendChild(defaultElement)
  }

  for (const mapping of selected) {
    const familyId = mapping.embeddedFamilyId!
    const faces = fontFamilies.get(familyId)
    if (!faces?.length) {
      warnings.push(
        `${mapping.replacement}: uploaded font family was not available.`
      )
      continue
    }
    const regular = faces.find((face) => face.summary.slot === "regular")
    if (!regular) {
      warnings.push(
        `${mapping.replacement}: a regular face is required for embedding.`
      )
      continue
    }

    const embeddedFont = presentationDocument.createElementNS(
      PRESENTATION_NS,
      "p:embeddedFont"
    )
    const font = presentationDocument.createElementNS(PRESENTATION_NS, "p:font")
    font.setAttribute("typeface", regular.summary.family)
    font.setAttribute("pitchFamily", "34")
    font.setAttribute("charset", "0")
    embeddedFont.appendChild(font)

    const orderedSlots: FontFaceSlot[] = [
      "regular",
      "bold",
      "italic",
      "boldItalic",
    ]
    for (const slot of orderedSlots) {
      const face = faces.find((candidate) => candidate.summary.slot === slot)
      if (!face) continue
      const payload = fontFaceToEot(face)
      const partName = nextFontPartName(zip, reservedParts)
      const relationshipId = nextRelationshipId(relationshipIds)
      zip.file(partName, payload, { binary: true })

      const relationship = relDocument.createElementNS(
        PACKAGE_REL_NS,
        "Relationship"
      )
      relationship.setAttribute("Id", relationshipId)
      relationship.setAttribute("Type", FONT_RELATIONSHIP)
      relationship.setAttribute("Target", partName.replace(/^ppt\//, ""))
      relationshipRoot.appendChild(relationship)

      const slotElement = presentationDocument.createElementNS(
        PRESENTATION_NS,
        `p:${slot}`
      )
      slotElement.setAttributeNS(RELATIONSHIP_NS, "r:id", relationshipId)
      embeddedFont.appendChild(slotElement)
    }

    embeddedList.appendChild(embeddedFont)
    embeddedFamilies.push(regular.summary.family)
  }

  if (elementChildren(embeddedList).length === 0)
    embeddedList.parentNode?.removeChild(embeddedList)
  zip.file(presentationPath, serializeXml(presentationDocument))
  zip.file(relsPath, serializeXml(relDocument))
  zip.file(contentTypesPath, serializeXml(contentTypesDocument))

  return { embeddedFamilies, removedEmbeddedFamilies, warnings }
}
