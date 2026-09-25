import type {
  FontImportResult,
  InspectionSummary,
  TransformReport,
  TransformRequest,
} from "@/lib/pptx/types"

export type WorkerCommand =
  | { type: "inspect"; requestId: string; file: File; packageId: string }
  | { type: "addFonts"; requestId: string; files: File[] }
  | { type: "clearFonts"; requestId: string }
  | { type: "clearPresentations"; requestId: string }
  | {
      type: "transform"
      requestId: string
      packageId: string
      request: TransformRequest
    }
  | { type: "dispose"; requestId: string }

export type WorkerEvent =
  | {
      type: "progress"
      requestId: string
      stage: string
      percent: number | null
      detail?: string
    }
  | { type: "inspectionReady"; requestId: string; summary: InspectionSummary }
  | { type: "fontLibraryChanged"; requestId: string; result: FontImportResult }
  | { type: "presentationsCleared"; requestId: string }
  | {
      type: "transformReady"
      requestId: string
      output: ArrayBuffer
      report: TransformReport
    }
  | { type: "disposed"; requestId: string }
  | { type: "failed"; requestId: string; message: string }
