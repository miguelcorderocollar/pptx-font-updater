import { DOMParser, XMLSerializer } from "@xmldom/xmldom"

const parser = new DOMParser({
  onError: (level, message) => {
    if (level === "error" || level === "fatalError") {
      throw new Error(message)
    }
  },
})

export function parseXml(xml: string, partName = "XML part"): Document {
  if (/<!DOCTYPE/i.test(xml)) {
    throw new Error(`${partName} contains a disallowed DOCTYPE declaration.`)
  }

  try {
    return parser.parseFromString(
      xml.replace(/^\uFEFF/, ""),
      "application/xml"
    ) as unknown as Document
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown XML error"
    throw new Error(`${partName} could not be parsed: ${message}`, {
      cause: error,
    })
  }
}

export function serializeXml(document: Document): string {
  const node = document as unknown as Parameters<
    XMLSerializer["serializeToString"]
  >[0]
  return new XMLSerializer().serializeToString(node)
}

export function elementChildren(node: Node): Element[] {
  const children: Element[] = []
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index)
    if (child?.nodeType === 1) children.push(child as Element)
  }
  return children
}

export function descendants(document: Document): Element[] {
  const all = document.getElementsByTagName("*")
  return Array.from({ length: all.length }, (_, index) =>
    all.item(index)
  ).filter((element): element is Element => Boolean(element))
}

export function getAttributeByLocalName(
  element: Element,
  localName: string
): Attr | null {
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index)
    if (attribute?.localName === localName || attribute?.name === localName)
      return attribute
  }
  return null
}

export function hasAncestor(element: Element, localName: string): boolean {
  let current = element.parentNode
  while (current?.nodeType === 1) {
    const currentElement = current as Element
    if (
      currentElement.localName === localName ||
      currentElement.nodeName === localName
    )
      return true
    current = current.parentNode
  }
  return false
}
