import { useCallback, useEffect, useRef, useState } from "react"

import type {
  FontImportResult,
  InspectionSummary,
  TransformReport,
  TransformRequest,
} from "@/lib/pptx/types"
import type { WorkerCommand, WorkerEvent } from "@/workers/protocol"

type WorkerRequest = WorkerCommand extends infer Command
  ? Command extends { requestId: string }
    ? Omit<Command, "requestId">
    : never
  : never

type Pending = {
  resolve: (event: WorkerEvent) => void
  reject: (error: Error) => void
}

type ProgressState = {
  stage: string
  percent: number | null
  detail?: string
} | null

export function usePptxWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<string, Pending>())
  const [progress, setProgress] = useState<ProgressState>(null)

  const startWorker = useCallback(() => {
    const worker = new Worker(
      new URL("../workers/pptx.worker.ts", import.meta.url),
      { type: "module" }
    )
    workerRef.current = worker
    worker.addEventListener("message", (message: MessageEvent<WorkerEvent>) => {
      if (workerRef.current !== worker) return
      const event = message.data
      if (!pendingRef.current.has(event.requestId)) return
      if (event.type === "progress") {
        setProgress({
          stage: event.stage,
          percent: event.percent,
          detail: event.detail,
        })
        return
      }
      const pending = pendingRef.current.get(event.requestId)
      if (!pending) return
      pendingRef.current.delete(event.requestId)
      setProgress(null)
      if (event.type === "failed") pending.reject(new Error(event.message))
      else pending.resolve(event)
    })
  }, [])

  useEffect(() => {
    startWorker()
    const pending = pendingRef.current
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      for (const request of pending.values())
        request.reject(new Error("Worker stopped."))
      pending.clear()
    }
  }, [startWorker])

  const reset = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    for (const request of pendingRef.current.values())
      request.reject(new DOMException("Operation canceled.", "AbortError"))
    pendingRef.current.clear()
    setProgress(null)
    startWorker()
  }, [startWorker])

  const request = useCallback(
    (command: WorkerRequest): Promise<WorkerEvent> => {
      return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID()
        pendingRef.current.set(requestId, { resolve, reject })
        workerRef.current?.postMessage({
          ...command,
          requestId,
        } as WorkerCommand)
      })
    },
    []
  )

  const inspect = useCallback(
    async (file: File, packageId: string): Promise<InspectionSummary> => {
      setProgress({
        stage: "Preparing presentation",
        percent: null,
        detail: "Opening the file on this device",
      })
      const event = await request({ type: "inspect", file, packageId })
      if (event.type !== "inspectionReady")
        throw new Error("Unexpected inspection response.")
      return event.summary
    },
    [request]
  )

  const addFonts = useCallback(
    async (files: File[]): Promise<FontImportResult> => {
      const event = await request({ type: "addFonts", files })
      if (event.type !== "fontLibraryChanged")
        throw new Error("Unexpected font response.")
      return event.result
    },
    [request]
  )

  const clearFonts = useCallback(async (): Promise<FontImportResult> => {
    const event = await request({ type: "clearFonts" })
    if (event.type !== "fontLibraryChanged")
      throw new Error("Unexpected font response.")
    return event.result
  }, [request])

  const clearPresentations = useCallback(async (): Promise<void> => {
    const event = await request({ type: "clearPresentations" })
    if (event.type !== "presentationsCleared")
      throw new Error("Unexpected presentation response.")
  }, [request])

  const transform = useCallback(
    async (
      transformRequest: TransformRequest,
      packageId: string
    ): Promise<{ output: ArrayBuffer; report: TransformReport }> => {
      const event = await request({
        type: "transform",
        packageId,
        request: transformRequest,
      })
      if (event.type !== "transformReady")
        throw new Error("Unexpected transform response.")
      return { output: event.output, report: event.report }
    },
    [request]
  )

  return {
    inspect,
    addFonts,
    clearFonts,
    clearPresentations,
    transform,
    progress,
    reset,
  }
}
