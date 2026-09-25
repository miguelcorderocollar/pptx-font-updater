import { useEffect, useMemo, useRef, useState } from "react"
import JSZip from "jszip"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileLock2Icon,
  InfoIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"

import { FilePickerCard } from "@/components/file-picker-card"
import { FontLibrary } from "@/components/font-library"
import { InspectionSummaryBar } from "@/components/inspection-summary"
import { MappingTable, type MappingRow } from "@/components/mapping-table"
import { ShareMappingsButton } from "@/components/share-mappings-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { usePptxWorker } from "@/hooks/use-pptx-worker"
import {
  clearSavedFonts,
  loadSavedFonts,
  saveFontFiles,
} from "@/lib/fonts/font-cache"
import {
  loadSavedMappings,
  mergeSavedMappings,
  saveSavedMappings,
  type SavedMapping,
} from "@/lib/mappings/saved-mappings"
import { readMappingShareLink } from "@/lib/mappings/share-link"
import { normalizeFontFamily } from "@/lib/pptx/font-normalization"
import type {
  EmbeddedFontSummary,
  FontFamilyUploadSummary,
  FontImportResult,
  InspectionSummary,
  TransformReport,
} from "@/lib/pptx/types"

type Presentation = { id: string; file: File; summary: InspectionSummary }

function mergeRows(
  presentations: Presentation[],
  savedMappings: SavedMapping[],
  uploadedFamilies: FontFamilyUploadSummary[]
): MappingRow[] {
  const savedByName = new Map(
    savedMappings.map((mapping) => [
      normalizeFontFamily(mapping.source),
      mapping,
    ])
  )
  const merged = new Map<string, MappingRow>()
  for (const { summary } of presentations) {
    for (const family of summary.families) {
      const current = merged.get(family.normalizedName)
      if (current) {
        current.referenceCount += family.referenceCount
        current.presentationCount += 1
        for (const [category, count] of Object.entries(family.categories)) {
          const key = category as keyof MappingRow["categories"]
          current.categories[key] = (current.categories[key] ?? 0) + count
        }
        current.sampleParts = Array.from(
          new Set([...current.sampleParts, ...family.sampleParts])
        ).slice(0, 3)
      } else {
        const saved = savedByName.get(family.normalizedName)
        const embedded = uploadedFamilies.find(
          (item) =>
            item.embeddable &&
            normalizeFontFamily(item.family) ===
              normalizeFontFamily(saved?.embeddedFont ?? "")
        )
        merged.set(family.normalizedName, {
          ...family,
          categories: { ...family.categories },
          sampleParts: [...family.sampleParts],
          presentationCount: 1,
          replacement: saved?.replacement ?? "",
          embeddedFamilyId: embedded?.id,
        })
      }
    }
  }
  return [...merged.values()].sort(
    (a, b) =>
      b.referenceCount - a.referenceCount ||
      a.displayName.localeCompare(b.displayName)
  )
}

function mergeEmbeddedFonts(
  presentations: Presentation[]
): Array<EmbeddedFontSummary & { presentationCount: number }> {
  const merged = new Map<
    string,
    EmbeddedFontSummary & { presentationCount: number }
  >()
  for (const { summary } of presentations) {
    for (const font of summary.embeddedFonts) {
      const current = merged.get(font.normalizedName)
      if (current) {
        current.presentationCount += 1
        current.slots = Array.from(new Set([...current.slots, ...font.slots]))
      } else {
        merged.set(font.normalizedName, {
          ...font,
          slots: [...font.slots],
          presentationCount: 1,
        })
      }
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  )
}

function outputName(input: string): string {
  const stem = input.replace(/\.pptx$/i, "") || "presentation"
  return `${stem}-fonts-updated.pptx`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function App() {
  const {
    inspect,
    addFonts,
    clearFonts,
    clearPresentations,
    transform,
    progress,
    reset,
  } = usePptxWorker()
  const [presentations, setPresentations] = useState<Presentation[]>([])
  const [savedMappings, setSavedMappings] = useState(loadSavedMappings)
  const [mappingStorageAvailable, setMappingStorageAvailable] = useState(true)
  const [incomingShare, setIncomingShare] = useState(() =>
    readMappingShareLink(window.location.hash)
  )
  const embeddedFonts = useMemo(
    () => mergeEmbeddedFonts(presentations),
    [presentations]
  )
  const [fontResult, setFontResult] = useState<FontImportResult | null>(null)
  const [fontFileCount, setFontFileCount] = useState(0)
  const [fontStorageStatus, setFontStorageStatus] = useState<
    "loading" | "available" | "unavailable"
  >("loading")
  const fontFilesRef = useRef<File[]>([])
  const restorePromiseRef = useRef<Promise<void>>(Promise.resolve())
  const presentationOperationRef = useRef(0)
  const [confirmRights, setConfirmRights] = useState(false)
  const [confirmPreviewPrint, setConfirmPreviewPrint] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<TransformReport | null>(null)
  const [busyAction, setBusyAction] = useState<
    "presentation" | "fonts" | "transform" | null
  >(null)

  const commitMappings = (next: SavedMapping[]) => {
    try {
      saveSavedMappings(next)
      setMappingStorageAvailable(true)
    } catch {
      setMappingStorageAvailable(false)
    }
    setSavedMappings(next)
  }

  useEffect(() => {
    const onHashChange = () =>
      setIncomingShare(readMappingShareLink(window.location.hash))
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    let canceled = false
    restorePromiseRef.current = (async () => {
      try {
        const saved = await loadSavedFonts()
        if (canceled) return
        fontFilesRef.current = saved
        setFontFileCount(saved.length)
        setFontStorageStatus("available")
        if (saved.length) {
          try {
            const result = await addFonts(saved)
            if (!canceled) setFontResult(result)
          } catch {
            if (!canceled) {
              setError(
                "Saved fonts could not be restored. Clear the library and add them again."
              )
            }
          }
        }
      } catch {
        if (!canceled) setFontStorageStatus("unavailable")
      }
    })()
    return () => {
      canceled = true
    }
  }, [addFonts])

  const rows = useMemo(
    () => mergeRows(presentations, savedMappings, fontResult?.families ?? []),
    [presentations, savedMappings, fontResult]
  )

  const mappedRows = useMemo(
    () => rows.filter((row) => row.replacement.trim()),
    [rows]
  )
  const embeddedRows = useMemo(
    () => mappedRows.filter((row) => row.embeddedFamilyId),
    [mappedRows]
  )
  const pendingEmbeddedRows = useMemo(() => {
    const savedByName = new Map(
      savedMappings.map((mapping) => [
        normalizeFontFamily(mapping.source),
        mapping,
      ])
    )
    return mappedRows.filter(
      (row) =>
        savedByName.get(row.normalizedName)?.embeddedFont &&
        !row.embeddedFamilyId
    )
  }, [mappedRows, savedMappings])
  const needsPreviewPrintConfirmation = useMemo(() => {
    const selectedIds = new Set(embeddedRows.map((row) => row.embeddedFamilyId))
    return (fontResult?.families ?? []).some(
      (family) =>
        selectedIds.has(family.id) && family.permission === "preview-print"
    )
  }, [embeddedRows, fontResult])
  const canGenerate =
    presentations.length > 0 &&
    mappedRows.length > 0 &&
    pendingEmbeddedRows.length === 0 &&
    fontStorageStatus !== "loading" &&
    (embeddedRows.length === 0 || confirmRights) &&
    (!needsPreviewPrintConfirmation || confirmPreviewPrint) &&
    !busyAction

  const handlePresentation = async (files: File[]) => {
    if (!files.length) return
    const operation = ++presentationOperationRef.current
    setBusyAction("presentation")
    setError(null)
    setReport(null)
    try {
      const added: Presentation[] = []
      for (const file of files.filter((item) => /\.pptx$/i.test(item.name))) {
        const id = crypto.randomUUID()
        const nextSummary = await inspect(file, id)
        if (operation !== presentationOperationRef.current) return
        added.push({ id, file, summary: nextSummary })
      }
      if (!added.length) throw new Error("Choose one or more .pptx files.")
      const nextPresentations = [...presentations, ...added]
      setPresentations(nextPresentations)
    } catch (reason) {
      if (
        operation === presentationOperationRef.current &&
        !(reason instanceof DOMException && reason.name === "AbortError")
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "The presentation could not be inspected."
        )
    } finally {
      if (operation === presentationOperationRef.current) setBusyAction(null)
    }
  }

  const handleFonts = async (files: File[]) => {
    setBusyAction("fonts")
    setError(null)
    try {
      await restorePromiseRef.current
      setFontResult(await addFonts(files))
      fontFilesRef.current.push(...files)
      setFontFileCount(fontFilesRef.current.length)
      try {
        await saveFontFiles(files)
        setFontStorageStatus("available")
      } catch {
        setFontStorageStatus("unavailable")
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The font files could not be read."
      )
    } finally {
      setBusyAction(null)
    }
  }

  const handleClearFonts = async () => {
    setBusyAction("fonts")
    setError(null)
    try {
      await restorePromiseRef.current
      let savedClearFailed = false
      try {
        await clearSavedFonts()
        setFontStorageStatus("available")
      } catch {
        savedClearFailed = true
        setFontStorageStatus("unavailable")
      }
      setFontResult(await clearFonts())
      fontFilesRef.current = []
      setFontFileCount(0)
      setConfirmRights(false)
      setConfirmPreviewPrint(false)
      setReport(null)
      if (savedClearFailed) {
        setError(
          "Fonts were cleared from this tab, but browser storage could not be cleared."
        )
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The font library could not be cleared."
      )
    } finally {
      setBusyAction(null)
    }
  }

  const handleGenerate = async () => {
    if (!presentations.length || !canGenerate) return
    setBusyAction("transform")
    setError(null)
    setReport(null)
    try {
      const zip = new JSZip()
      const combinedReport: TransformReport = {
        changedReferences: 0,
        changedParts: 0,
        embeddedFamilies: [],
        removedEmbeddedFamilies: [],
        warnings: [],
        outputSize: 0,
      }
      let singleOutput: ArrayBuffer | null = null
      const usedNames = new Set<string>()
      for (const item of presentations) {
        const names = new Set(
          item.summary.families.map((family) => family.normalizedName)
        )
        const applicable = mappedRows.filter((row) =>
          names.has(row.normalizedName)
        )
        let output: ArrayBuffer
        if (applicable.length) {
          const result = await transform(
            {
              mappings: applicable.map((row) => ({
                source: row.displayName,
                replacement: row.replacement,
                embeddedFamilyId: row.embeddedFamilyId,
              })),
              confirmEmbeddingRights: confirmRights,
              confirmPreviewPrint,
            },
            item.id
          )
          output = result.output
          combinedReport.changedReferences += result.report.changedReferences
          combinedReport.changedParts += result.report.changedParts
          combinedReport.embeddedFamilies.push(
            ...result.report.embeddedFamilies
          )
          combinedReport.removedEmbeddedFamilies.push(
            ...result.report.removedEmbeddedFamilies
          )
          combinedReport.warnings.push(...result.report.warnings)
        } else {
          output = await item.file.arrayBuffer()
          combinedReport.warnings.push(
            `${item.summary.fileName}: no matching font mapping; included unchanged.`
          )
        }
        combinedReport.outputSize += output.byteLength
        singleOutput = output
        let name = outputName(item.summary.fileName)
        let suffix = 2
        while (usedNames.has(name.toLowerCase())) {
          name = outputName(item.summary.fileName).replace(
            /\.pptx$/i,
            `-${suffix++}.pptx`
          )
        }
        usedNames.add(name.toLowerCase())
        zip.file(name, output)
      }
      const batch = presentations.length > 1
      const url = URL.createObjectURL(
        batch
          ? await zip.generateAsync({ type: "blob", compression: "DEFLATE" })
          : new Blob([singleOutput!], {
              type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            })
      )
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = batch
        ? "updated-presentations.zip"
        : outputName(presentations[0].summary.fileName)
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setReport(combinedReport)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The presentation could not be generated."
      )
    } finally {
      setBusyAction(null)
    }
  }

  const updateMapping = (
    normalizedName: string,
    patch: Partial<Pick<MappingRow, "replacement" | "embeddedFamilyId">>
  ) => {
    const row = rows.find((item) => item.normalizedName === normalizedName)
    if (!row) return
    const existing = savedMappings.find(
      (item) => normalizeFontFamily(item.source) === normalizedName
    )
    const embeddedFont = Object.hasOwn(patch, "embeddedFamilyId")
      ? (fontResult?.families.find(
          (family) => family.id === patch.embeddedFamilyId
        )?.family ?? "")
      : (existing?.embeddedFont ?? "")
    commitMappings(
      mergeSavedMappings(savedMappings, [
        {
          source: row.displayName,
          replacement:
            patch.replacement ?? existing?.replacement ?? row.replacement,
          embeddedFont,
        },
      ])
    )
    setReport(null)
  }

  const importMappings = (incoming: SavedMapping[]) => {
    commitMappings(mergeSavedMappings(savedMappings, incoming))
    setReport(null)
  }

  const dismissIncomingShare = () => {
    setIncomingShare(null)
    if (window.location.hash.startsWith("#m=")) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`
      )
    }
  }

  const clearMappings = () => {
    commitMappings([])
    setReport(null)
  }

  const startOver = async () => {
    setBusyAction("presentation")
    try {
      await clearPresentations()
      setPresentations([])
      setConfirmRights(false)
      setConfirmPreviewPrint(false)
      setError(null)
      setReport(null)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not start over."
      )
    } finally {
      setBusyAction(null)
    }
  }

  const cancelInspection = () => {
    presentationOperationRef.current += 1
    reset()
    setPresentations([])
    setConfirmRights(false)
    setConfirmPreviewPrint(false)
    setError(null)
    setReport(null)
    const files = fontFilesRef.current
    if (files.length) {
      setBusyAction("fonts")
      void addFonts(files)
        .then(setFontResult)
        .catch(() => setFontResult(null))
        .finally(() => setBusyAction(null))
    } else {
      setBusyAction(null)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-[var(--workspace)]">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/font-mark.svg"
              alt=""
              aria-hidden="true"
              className="size-9 rounded-lg shadow-[var(--shadow-control)]"
            />
            <h1 className="text-sm font-semibold tracking-tight">
              PPTX Font Updater
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden gap-1.5 sm:inline-flex">
              <FileLock2Icon className="size-3.5" /> Files stay on your device
            </Badge>
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>
                <InfoIcon data-icon="inline-start" /> Info
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>About PPTX Font Updater</DialogTitle>
                  <DialogDescription>
                    Replace font names in PowerPoint files and optionally embed
                    licensed font files.
                  </DialogDescription>
                </DialogHeader>
                <ol className="list-decimal space-y-2 ps-5 text-sm leading-6">
                  <li>Choose one or more PPTX files to find their fonts.</li>
                  <li>Set replacements and add font files if needed.</li>
                  <li>Download the updated PPTX or ZIP.</li>
                </ol>
                <p className="text-sm leading-6 text-muted-foreground">
                  Presentations stay in this tab. Font files are saved in this
                  browser when storage is available. Nothing is uploaded.
                </p>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {progress ? (
          <div className="mb-5 rounded-lg bg-card p-3 shadow-[var(--shadow-surface)]">
            <Progress value={progress.percent}>
              <ProgressLabel>{progress.stage}</ProgressLabel>
              {progress.percent !== null ? <ProgressValue /> : null}
              {progress.detail ? (
                <span className="order-last w-full text-xs text-muted-foreground">
                  {progress.detail}
                </span>
              ) : null}
            </Progress>
            {busyAction === "presentation" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={cancelInspection}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive" className="mb-5 bg-card">
            <AlertTriangleIcon />
            <AlertTitle>Could not complete that step</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {presentations.length === 0 ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <FilePickerCard
              kind="presentation"
              title={
                busyAction === "presentation"
                  ? "Inspecting presentation…"
                  : "Drop PowerPoint files here"
              }
              description="Choose one or more .pptx files from your device. They stay in this browser tab."
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple
              onFiles={handlePresentation}
            />
            <div className="space-y-5">
              <Card className="border-0 shadow-[var(--shadow-surface)]">
                <CardHeader>
                  <CardTitle>What gets checked</CardTitle>
                  <CardDescription>
                    Direct OOXML editing avoids rebuilding your deck.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  {[
                    "Theme, master, layout, and slide references",
                    "Notes, charts, diagrams, and drawings",
                    "Existing embedded-font declarations",
                  ].map((item) => (
                    <div key={item} className="flex gap-2.5">
                      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <FontLibrary
                result={fontResult}
                fileCount={fontFileCount}
                storageStatus={fontStorageStatus}
                onClear={handleClearFonts}
                disabled={
                  busyAction !== null || fontStorageStatus === "loading"
                }
              />
              {savedMappings.length > 0 ? (
                <Card className="border-0 shadow-[var(--shadow-surface)]">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>Saved mappings</CardTitle>
                      <div className="flex flex-wrap gap-1">
                        <ShareMappingsButton mappings={savedMappings} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearMappings}
                        >
                          <Trash2Icon data-icon="inline-start" /> Clear
                        </Button>
                      </div>
                    </div>
                    <CardDescription>
                      {savedMappings.length} font replacement
                      {savedMappings.length === 1 ? "" : "s"} ready for your
                      next presentation.
                      {mappingStorageAvailable
                        ? ""
                        : " Browser storage is unavailable."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <InspectionSummaryBar
              summaries={presentations.map((item) => item.summary)}
              onStartOver={startOver}
              disabled={busyAction !== null}
            />

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <MappingTable
                rows={rows}
                savedMappings={savedMappings}
                storageAvailable={mappingStorageAvailable}
                embeddedFonts={embeddedFonts}
                presentationCount={presentations.length}
                uploadedFamilies={fontResult?.families ?? []}
                onChange={updateMapping}
                onImportMappings={importMappings}
                onClearMappings={clearMappings}
              />

              <aside className="space-y-5 xl:sticky xl:top-5">
                <FilePickerCard
                  kind="presentation"
                  compact
                  title={
                    busyAction === "presentation"
                      ? "Reading presentations…"
                      : "Add presentations"
                  }
                  description="Choose or drop more .pptx files. The same mappings apply to all."
                  accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  multiple
                  onFiles={handlePresentation}
                />
                <FilePickerCard
                  kind="fonts"
                  compact
                  title={
                    busyAction === "fonts" ? "Reading fonts…" : "Add font files"
                  }
                  description="TTF, OTF, or ZIP. Add one or many."
                  accept=".ttf,.otf,.zip,font/ttf,font/otf,application/zip"
                  multiple
                  onFiles={handleFonts}
                />
                <FontLibrary
                  result={fontResult}
                  fileCount={fontFileCount}
                  storageStatus={fontStorageStatus}
                  onClear={handleClearFonts}
                  disabled={
                    busyAction !== null || fontStorageStatus === "loading"
                  }
                />

                <Card className="border-0 shadow-[var(--shadow-surface)]">
                  <CardHeader>
                    <CardTitle>Generate copy</CardTitle>
                    <CardDescription>
                      {mappedRows.length} shared mapping
                      {mappedRows.length === 1 ? "" : "s"} across{" "}
                      {presentations.length} file
                      {presentations.length === 1 ? "" : "s"} ·{" "}
                      {embeddedRows.length} with embedded files
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pendingEmbeddedRows.length > 0 ? (
                      <Alert variant="destructive">
                        <AlertTriangleIcon />
                        <AlertTitle>Font files needed</AlertTitle>
                        <AlertDescription>
                          Upload the fonts selected by saved mappings for{" "}
                          {pendingEmbeddedRows
                            .map((row) => row.displayName)
                            .join(", ")}
                          , or choose References only for those rows.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {embeddedRows.length > 0 ? (
                      <div className="space-y-3">
                        <label className="flex items-start gap-3 text-sm leading-5">
                          <Checkbox
                            checked={confirmRights}
                            onCheckedChange={(checked) =>
                              setConfirmRights(checked === true)
                            }
                          />
                          <span>
                            I have permission to embed these font files.
                          </span>
                        </label>
                        {needsPreviewPrintConfirmation ? (
                          <label className="flex items-start gap-3 text-sm leading-5">
                            <Checkbox
                              checked={confirmPreviewPrint}
                              onCheckedChange={(checked) =>
                                setConfirmPreviewPrint(checked === true)
                              }
                            />
                            <span>
                              I understand Preview &amp; Print fonts may not be
                              editable.
                            </span>
                          </label>
                        ) : null}
                        <Alert>
                          <ShieldCheckIcon />
                          <AlertTitle>Embedding is license-aware</AlertTitle>
                          <AlertDescription>
                            Restricted and bitmap-only fonts cannot be selected.
                          </AlertDescription>
                        </Alert>
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-muted-foreground">
                        Set replacement names to update references. Uploading
                        fonts is optional.
                      </p>
                    )}
                    <Separator />
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={!canGenerate}
                      onClick={handleGenerate}
                    >
                      {busyAction === "transform" ? (
                        <LoaderCircleIcon
                          data-icon="inline-start"
                          className="animate-spin"
                        />
                      ) : (
                        <DownloadIcon data-icon="inline-start" />
                      )}
                      {presentations.length > 1
                        ? "Generate ZIP"
                        : "Generate PPTX"}
                    </Button>
                  </CardContent>
                </Card>
              </aside>
            </div>

            {report ? (
              <Alert className="bg-card shadow-[var(--shadow-surface)]">
                <CheckCircle2Icon className="text-[var(--success)]" />
                <AlertTitle>
                  {presentations.length > 1
                    ? "ZIP downloaded"
                    : "Validated PPTX downloaded"}
                </AlertTitle>
                <AlertDescription>
                  Updated {report.changedReferences} references across{" "}
                  {report.changedParts} package parts.{" "}
                  {report.embeddedFamilies.length
                    ? `Embedded ${Array.from(new Set(report.embeddedFamilies)).join(", ")}. `
                    : ""}
                  Total output size: {formatBytes(report.outputSize)}.
                  {report.warnings.length
                    ? ` ${report.warnings.join(" ")}`
                    : ""}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </main>

      <Dialog
        open={incomingShare !== null}
        onOpenChange={(open) => {
          if (!open) dismissIncomingShare()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {incomingShare?.kind === "valid"
                ? "Import shared mappings"
                : "Mapping link unavailable"}
            </DialogTitle>
            <DialogDescription>
              {incomingShare?.kind === "valid"
                ? `${incomingShare.mappings.length} font mapping${incomingShare.mappings.length === 1 ? "" : "s"} in this link. Matching saved sources will be replaced; other mappings stay.`
                : incomingShare?.message}
            </DialogDescription>
          </DialogHeader>
          {incomingShare?.kind === "valid" ? (
            <div className="max-h-48 overflow-auto rounded-lg border p-3 text-sm">
              {incomingShare.mappings.slice(0, 8).map((mapping) => (
                <p key={mapping.source} className="py-0.5">
                  {mapping.source} → {mapping.replacement}
                  {mapping.embeddedFont
                    ? " · embed when font file is available"
                    : ""}
                </p>
              ))}
              {incomingShare.mappings.length > 8 ? (
                <p className="pt-1 text-muted-foreground">
                  And {incomingShare.mappings.length - 8} more
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={dismissIncomingShare}>
              {incomingShare?.kind === "valid" ? "Cancel" : "Close"}
            </Button>
            {incomingShare?.kind === "valid" ? (
              <Button
                onClick={() => {
                  importMappings(incomingShare.mappings)
                  dismissIncomingShare()
                }}
              >
                Import mappings
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="border-t bg-background">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-1 px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p>
            Presentations stay in this tab. Fonts are saved in this browser when
            storage is available.
          </p>
          <p>
            Open the downloaded copy in PowerPoint for final visual validation.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
