import {
  ArrowLeftIcon,
  FileTextIcon,
  Layers3Icon,
  TypeIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { InspectionSummary } from "@/lib/pptx/types"

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function InspectionSummaryBar({
  summaries,
  onStartOver,
  disabled = false,
}: {
  summaries: InspectionSummary[]
  onStartOver: () => void
  disabled?: boolean
}) {
  const single = summaries.length === 1 ? summaries[0] : null
  const totalSize = summaries.reduce(
    (sum, summary) => sum + summary.fileSize,
    0
  )
  const slides = summaries.reduce((sum, summary) => sum + summary.slideCount, 0)
  const references = summaries.reduce(
    (sum, summary) => sum + summary.referenceCount,
    0
  )
  const familyCount = new Set(
    summaries.flatMap((summary) =>
      summary.families.map((family) => family.normalizedName)
    )
  ).size
  return (
    <section className="rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-surface)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_14rem]">
          <p className="font-medium break-words">
            {single
              ? single.fileName
              : `${summaries.length} presentations selected`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatBytes(totalSize)} ·{" "}
            {single
              ? `${single.packagePartCount} package parts`
              : "One set of font mappings for every file"}
          </p>
          {summaries.length > 1 ? (
            <ul
              className="mt-2 flex flex-wrap gap-1.5"
              aria-label="Selected presentations"
            >
              {summaries.map((summary, index) => (
                <li
                  key={`${summary.fileName}-${index}`}
                  className="max-w-full truncate rounded-md border px-2 py-0.5 text-xs text-muted-foreground"
                  title={summary.fileName}
                >
                  {summary.fileName}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          disabled={disabled}
          onClick={onStartOver}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Start over
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-sm tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <Layers3Icon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          {slides} slides
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          {familyCount} families
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileTextIcon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          {references} references
        </span>
      </div>
    </section>
  )
}
