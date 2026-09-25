/// <reference lib="webworker" />

import JSZip from "jszip"

import {
  parseFontFace,
  summarizeFontLibrary,
  type ParsedFontFace,
} from "@/lib/fonts/font-metadata"
import { inspectPptx } from "@/lib/pptx/inspect"
import type { FontImportResult } from "@/lib/pptx/types"
import { transformPptx } from "@/lib/pptx/transform"

import type { WorkerCommand, WorkerEvent } from "./protocol"

const packages = new Map<string, { data: ArrayBuffer; fileName: string }>()
const fontFaces = new Map<string, ParsedFontFace>()
const rejectedFonts: FontImportResult["rejected"] = []

type FontArchiveEntry = JSZip.JSZipObject & {
  _data?: { uncompressedSize?: number }
}

function send(event: WorkerEvent, transfer: Transferable[] = []) {
  self.postMessage(event, { transfer })
}

function progress(
  requestId: string,
  stage: string,
  percent: number | null,
  detail?: string
) {
  send({ type: "progress", requestId, stage, percent, detail })
}

function formatReadSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readPresentation(file: File, requestId: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    let lastPercent = -1
    const report = (loaded: number) => {
      const percent = file.size ? Math.round((loaded / file.size) * 100) : 100
      if (percent === lastPercent) return
      lastPercent = percent
      progress(
        requestId,
        "Reading presentation",
        percent,
        `${formatReadSize(loaded)} of ${formatReadSize(file.size)} read on this device`
      )
    }
    reader.onprogress = (event) => report(event.loaded)
    reader.onload = () => {
      report(file.size)
      resolve(reader.result as ArrayBuffer)
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error("The file could not be read."))
    reader.onabort = () => reject(new Error("The file read was interrupted."))
    report(0)
    reader.readAsArrayBuffer(file)
  })
}

async function addFontBuffer(fileName: string, data: ArrayBuffer) {
  try {
    const parsed = await parseFontFace(fileName, data)
    fontFaces.set(parsed.summary.id, parsed)
  } catch (error) {
    rejectedFonts.push({
      fileName,
      reason:
        error instanceof Error ? error.message : "The font could not be read.",
    })
  }
}

async function addFontArchive(file: File) {
  if (file.size > 100 * 1024 * 1024)
    throw new Error(`${file.name} exceeds the 100 MB archive limit.`)
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), {
    checkCRC32: true,
  })
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir
  ) as FontArchiveEntry[]
  if (entries.length > 100)
    throw new Error(`${file.name} contains more than 100 files.`)

  const expandedSize = entries.reduce(
    (total, entry) => total + (entry._data?.uncompressedSize ?? 0),
    0
  )
  if (expandedSize > 250 * 1024 * 1024) {
    throw new Error(`${file.name} exceeds the 250 MB expanded archive limit.`)
  }

  for (const entry of entries) {
    const lower = entry.name.toLocaleLowerCase("en-US")
    if (
      entry.name.includes("\0") ||
      entry.name.startsWith("/") ||
      entry.name.split("/").includes("..")
    ) {
      rejectedFonts.push({
        fileName: entry.name,
        reason: "Unsafe archive paths are skipped.",
      })
      continue
    }
    if (
      lower.endsWith(".zip") ||
      /\.(?:exe|dll|dylib|so|js|sh|command)$/i.test(lower)
    ) {
      rejectedFonts.push({
        fileName: entry.name,
        reason: "Nested archives and executable files are skipped.",
      })
      continue
    }
    if (!lower.endsWith(".ttf") && !lower.endsWith(".otf")) continue
    if ((entry._data?.uncompressedSize ?? 0) > 30 * 1024 * 1024) {
      rejectedFonts.push({
        fileName: entry.name,
        reason: "The font exceeds the 30 MB face limit.",
      })
      continue
    }
    const data = await entry.async("arraybuffer")
    await addFontBuffer(entry.name, data)
  }
}

async function handle(command: WorkerCommand) {
  try {
    if (command.type === "inspect") {
      const data = await readPresentation(command.file, command.requestId)
      progress(
        command.requestId,
        "Checking presentation package",
        null,
        "Checking file integrity and package structure"
      )
      let lastScanPercent = -1
      const inspected = await inspectPptx(data, command.file.name, {
        packageLoaded: () =>
          progress(
            command.requestId,
            "Scanning presentation content",
            null,
            "Finding font references in slides, layouts, and themes"
          ),
        partChecked: (completed, total) => {
          const scanPercent = total
            ? Math.floor((completed / total) * 100)
            : 100
          if (scanPercent === lastScanPercent) return
          lastScanPercent = scanPercent
          progress(
            command.requestId,
            "Scanning presentation content",
            null,
            `${completed} of ${total} XML parts checked`
          )
        },
      })
      packages.set(command.packageId, { data, fileName: command.file.name })
      send({
        type: "inspectionReady",
        requestId: command.requestId,
        summary: inspected.summary,
      })
      return
    }

    if (command.type === "addFonts") {
      progress(command.requestId, "Reading fonts", 10)
      for (let index = 0; index < command.files.length; index += 1) {
        const file = command.files[index]
        if (file.name.toLocaleLowerCase("en-US").endsWith(".zip"))
          await addFontArchive(file)
        else await addFontBuffer(file.name, await file.arrayBuffer())
        progress(
          command.requestId,
          `Reading ${file.name}`,
          Math.round(((index + 1) / command.files.length) * 90)
        )
      }
      send({
        type: "fontLibraryChanged",
        requestId: command.requestId,
        result: summarizeFontLibrary(fontFaces.values(), rejectedFonts),
      })
      return
    }

    if (command.type === "clearFonts") {
      fontFaces.clear()
      rejectedFonts.length = 0
      send({
        type: "fontLibraryChanged",
        requestId: command.requestId,
        result: summarizeFontLibrary(fontFaces.values(), rejectedFonts),
      })
      return
    }

    if (command.type === "clearPresentations") {
      packages.clear()
      send({ type: "presentationsCleared", requestId: command.requestId })
      return
    }

    if (command.type === "transform") {
      const activePackage = packages.get(command.packageId)
      if (!activePackage)
        throw new Error("Choose a presentation before generating a file.")
      const zip = await JSZip.loadAsync(activePackage.data)
      progress(command.requestId, "Replacing references", 15)
      const byFamily = new Map<string, ParsedFontFace[]>()
      for (const face of fontFaces.values()) {
        const list = byFamily.get(face.summary.normalizedFamily) ?? []
        list.push(face)
        byFamily.set(face.summary.normalizedFamily, list)
      }
      for (const faces of byFamily.values()) {
        faces.sort(
          (a, b) =>
            Number(b.summary.embeddable) - Number(a.summary.embeddable) ||
            Number(b.sourceType === "ttf") - Number(a.sourceType === "ttf") ||
            a.summary.fileName.localeCompare(b.summary.fileName)
        )
      }
      const result = await transformPptx(
        zip,
        activePackage.fileName,
        command.request,
        byFamily
      )
      progress(command.requestId, "Validating output", 100)
      send(
        {
          type: "transformReady",
          requestId: command.requestId,
          output: result.output,
          report: result.report,
        },
        [result.output]
      )
      return
    }

    packages.clear()
    fontFaces.clear()
    rejectedFonts.length = 0
    send({ type: "disposed", requestId: command.requestId })
  } catch (error) {
    send({
      type: "failed",
      requestId: command.requestId,
      message: error instanceof Error ? error.message : "The operation failed.",
    })
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerCommand>) => {
  void handle(event.data)
})

export {}
