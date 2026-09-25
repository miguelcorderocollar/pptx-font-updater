import { useMemo, useRef, useState } from "react"
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ClipboardPasteIcon,
  DownloadIcon,
  FileCheck2Icon,
  SearchIcon,
  UploadIcon,
} from "lucide-react"
import Papa from "papaparse"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShareMappingsButton } from "@/components/share-mappings-button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { normalizeFontFamily } from "@/lib/pptx/font-normalization"
import { parseMappingCsv } from "@/lib/mappings/csv"
import type { SavedMapping } from "@/lib/mappings/saved-mappings"
import type {
  EmbeddedFontSummary,
  FontFamilySummary,
  FontFamilyUploadSummary,
} from "@/lib/pptx/types"

export type MappingRow = FontFamilySummary & {
  presentationCount: number
  replacement: string
  embeddedFamilyId?: string
}

type MappingTableProps = {
  rows: MappingRow[]
  savedMappings: SavedMapping[]
  storageAvailable: boolean
  embeddedFonts: Array<EmbeddedFontSummary & { presentationCount: number }>
  presentationCount: number
  uploadedFamilies: FontFamilyUploadSummary[]
  onChange: (
    normalizedName: string,
    patch: Partial<Pick<MappingRow, "replacement" | "embeddedFamilyId">>
  ) => void
  onImportMappings: (mappings: SavedMapping[]) => void
  onClearMappings: () => void
}

const columnHelper = createColumnHelper<MappingRow>()
const columns = [
  columnHelper.accessor("displayName", { header: "Detected family" }),
  columnHelper.accessor("referenceCount", { header: "References" }),
  columnHelper.accessor("replacement", { header: "Replacement" }),
]

export function MappingTable({
  rows,
  savedMappings,
  storageAvailable,
  embeddedFonts,
  presentationCount,
  uploadedFamilies,
  onChange,
  onImportMappings,
  onClearMappings,
}: MappingTableProps) {
  const [query, setQuery] = useState("")
  const [pasteOpen, setPasteOpen] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [csvError, setCsvError] = useState("")
  const csvInputRef = useRef<HTMLInputElement>(null)
  const embeddedNames = useMemo(
    () => new Set(embeddedFonts.map((font) => font.normalizedName)),
    [embeddedFonts]
  )
  const savedByName = useMemo(
    () =>
      new Map(
        savedMappings.map((mapping) => [
          normalizeFontFamily(mapping.source),
          mapping,
        ])
      ),
    [savedMappings]
  )
  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeFontFamily(query)
    if (!normalizedQuery) return rows
    return rows.filter((row) =>
      normalizeFontFamily(row.displayName).includes(normalizedQuery)
    )
  }, [query, rows])
  // TanStack Table intentionally returns non-memoizable functions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const importCsv = (csv: string) => {
    try {
      onImportMappings(parseMappingCsv(csv))
      setCsvError("")
      return true
    } catch (reason) {
      setCsvError(
        reason instanceof Error ? reason.message : "Could not read CSV."
      )
      return false
    }
  }

  const exportCsv = () => {
    const csv = Papa.unparse(
      savedMappings.map((mapping) => ({
        source: mapping.source,
        replacement: mapping.replacement,
        embedded_font: mapping.embeddedFont,
      }))
    )
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "font-mappings.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="min-w-0 border-0 shadow-[var(--shadow-surface)]">
      <CardHeader className="border-b min-[780px]:grid-cols-[1fr_auto]">
        <div>
          <CardTitle>Font mappings</CardTitle>
          <CardDescription className="mt-1">
            {presentationCount > 1
              ? "One mapping applies to every selected file. Counts combine matching references across files. "
              : "Counts are XML references, not characters. "}
            Saved mappings apply to future files. Empty rows stay unchanged.
            {storageAvailable ? "" : " Browser storage is unavailable."}
          </CardDescription>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 min-[780px]:mt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPasteOpen(true)}
          >
            <ClipboardPasteIcon data-icon="inline-start" /> Paste CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => csvInputRef.current?.click()}
          >
            <UploadIcon data-icon="inline-start" /> Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={savedMappings.length === 0}
          >
            <DownloadIcon data-icon="inline-start" /> Export CSV
          </Button>
          <ShareMappingsButton mappings={savedMappings} />
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearMappings}
            disabled={savedMappings.length === 0}
          >
            Clear mappings
          </Button>
          <Input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only !size-px !w-px"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void file.text().then(importCsv)
              event.currentTarget.value = ""
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="border-b px-4 py-3">
          <div className="relative max-w-sm">
            <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filter detected families"
              className="ps-8"
              aria-label="Filter detected font families"
            />
          </div>
        </div>
        <div className="max-h-[70svh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="min-w-48 pl-5">Detected family</TableHead>
                <TableHead className="w-24 text-end">Refs</TableHead>
                <TableHead className="min-w-52">Replacement</TableHead>
                <TableHead className="min-w-52">Embed in output</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map(({ original }) => (
                <TableRow key={original.normalizedName}>
                  <TableCell className="pl-5">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="font-medium">{original.displayName}</p>
                        {embeddedNames.has(original.normalizedName) ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                            title="Embedded in at least one original presentation"
                          >
                            <FileCheck2Icon
                              className="size-3"
                              aria-hidden="true"
                            />
                            Embedded
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {presentationCount > 1 ? (
                          <Badge variant="secondary" className="font-normal">
                            In {original.presentationCount} of{" "}
                            {presentationCount} files
                          </Badge>
                        ) : null}
                        {Object.keys(original.categories)
                          .filter((category) => category !== "theme")
                          .slice(0, 3)
                          .map((category) => (
                            <Badge
                              key={category}
                              variant="outline"
                              className="font-normal"
                            >
                              {category}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs tabular-nums">
                    {original.referenceCount}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={original.replacement}
                      onChange={(event) =>
                        onChange(original.normalizedName, {
                          replacement: event.currentTarget.value,
                          embeddedFamilyId: undefined,
                        })
                      }
                      placeholder="Leave unchanged"
                      aria-label={`Replacement for ${original.displayName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <Select
                        value={original.embeddedFamilyId ?? "none"}
                        onValueChange={(value) => {
                          if (!value || value === "none") {
                            if (
                              !uploadedFamilies.some(
                                (family) =>
                                  family.id === original.embeddedFamilyId
                              )
                            )
                              return
                            onChange(original.normalizedName, {
                              embeddedFamilyId: undefined,
                            })
                            return
                          }
                          const family = uploadedFamilies.find(
                            (item) => item.id === value
                          )
                          onChange(original.normalizedName, {
                            embeddedFamilyId: value,
                            replacement: family?.family ?? original.replacement,
                          })
                        }}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={`Embedded font for ${original.displayName}`}
                        >
                          <SelectValue placeholder="References only">
                            {uploadedFamilies.find(
                              (family) =>
                                family.id === original.embeddedFamilyId
                            )?.family ?? "References only"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start">
                          <SelectItem value="none">References only</SelectItem>
                          {uploadedFamilies.map((family) => (
                            <SelectItem
                              key={family.id}
                              value={family.id}
                              disabled={!family.embeddable}
                            >
                              {family.family}
                              {family.embeddable ? "" : " · unavailable"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {savedByName.get(original.normalizedName)?.embeddedFont &&
                      !original.embeddedFamilyId ? (
                        <button
                          type="button"
                          className="text-start text-xs text-destructive underline-offset-2 hover:underline"
                          onClick={() =>
                            onChange(original.normalizedName, {
                              embeddedFamilyId: undefined,
                            })
                          }
                        >
                          Missing{" "}
                          {
                            savedByName.get(original.normalizedName)
                              ?.embeddedFont
                          }
                          . Use references only
                        </button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Paste font mappings</DialogTitle>
            <DialogDescription>
              Paste CSV with source,replacement,embedded_font columns. Saved
              mappings apply whenever a matching font appears in a presentation.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.currentTarget.value)}
            className="min-h-48 w-full resize-y rounded-lg border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={
              "source,replacement,embedded_font\nArial,Example Sans,Example Sans"
            }
            aria-label="CSV mappings"
          />
          {csvError ? (
            <p className="text-sm text-destructive">{csvError}</p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                if (importCsv(csvText)) setPasteOpen(false)
              }}
            >
              Apply mappings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
