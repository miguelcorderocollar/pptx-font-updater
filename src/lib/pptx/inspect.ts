import type JSZip from "jszip"

import { inspectPackage } from "./font-inventory"
import { loadPptxPackage } from "./package-preflight"
import type { InspectionSummary } from "./types"

export type InspectedPackage = {
  zip: JSZip
  summary: InspectionSummary
}

export async function inspectPptx(
  data: ArrayBuffer,
  fileName: string,
  onProgress?: {
    packageLoaded?: () => void
    partChecked?: (completed: number, total: number) => void
  }
): Promise<InspectedPackage> {
  const zip = await loadPptxPackage(data)
  onProgress?.packageLoaded?.()
  const summary = await inspectPackage(
    zip,
    fileName,
    data.byteLength,
    onProgress?.partChecked
  )
  return { zip, summary }
}
