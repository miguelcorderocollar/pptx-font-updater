import JSZip from "jszip"

const MAX_INPUT_BYTES = 100 * 1024 * 1024
const MAX_ENTRIES = 10_000
const MAX_DECLARED_BYTES = 500 * 1024 * 1024

type ZipEntryWithSize = JSZip.JSZipObject & {
  _data?: { uncompressedSize?: number }
}

export async function loadPptxPackage(data: ArrayBuffer): Promise<JSZip> {
  if (data.byteLength === 0) throw new Error("The selected file is empty.")
  if (data.byteLength > MAX_INPUT_BYTES)
    throw new Error("The presentation exceeds the 100 MB limit.")

  const zip = await JSZip.loadAsync(data, {
    checkCRC32: true,
    createFolders: false,
  })
  const entries = Object.values(zip.files)
  if (entries.length > MAX_ENTRIES)
    throw new Error("The presentation contains too many package parts.")

  let declaredBytes = 0
  for (const entry of entries as ZipEntryWithSize[]) {
    if (
      entry.name.includes("\0") ||
      entry.name.startsWith("/") ||
      entry.name.split("/").includes("..")
    ) {
      throw new Error("The presentation contains an unsafe package path.")
    }
    declaredBytes += entry._data?.uncompressedSize ?? 0
  }
  if (declaredBytes > MAX_DECLARED_BYTES) {
    throw new Error(
      "The expanded presentation exceeds the 500 MB safety limit."
    )
  }

  for (const required of [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
  ]) {
    if (!zip.file(required))
      throw new Error(
        `The file is not a valid PPTX package. Missing ${required}.`
      )
  }

  return zip
}

export function xmlPartPaths(zip: JSZip): string[] {
  return Object.keys(zip.files).filter(
    (path) =>
      !zip.files[path].dir && (path.endsWith(".xml") || path.endsWith(".rels"))
  )
}
