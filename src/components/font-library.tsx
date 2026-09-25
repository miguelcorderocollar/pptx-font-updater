import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"

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
import type { FontImportResult } from "@/lib/pptx/types"

const permissionLabel = {
  installable: "Installable",
  editable: "Editable",
  "preview-print": "Preview & Print",
  restricted: "Restricted",
  "bitmap-only": "Bitmap only",
}

export function FontLibrary({
  result,
  fileCount,
  storageStatus,
  onClear,
  disabled = false,
}: {
  result: FontImportResult | null
  fileCount: number
  storageStatus: "loading" | "available" | "unavailable"
  onClear: () => void
  disabled?: boolean
}) {
  const families = result?.families ?? []
  const hasFiles =
    fileCount > 0 || families.length > 0 || Boolean(result?.rejected.length)
  return (
    <Card className="border-0 shadow-[var(--shadow-surface)]">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Font library</CardTitle>
          {hasFiles ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onClear}
            >
              <Trash2Icon data-icon="inline-start" /> Clear
            </Button>
          ) : null}
        </div>
        <CardDescription>
          {storageStatus === "loading"
            ? "Checking this browser for saved fonts."
            : storageStatus === "unavailable"
              ? "Fonts work in this tab, but this browser could not save them."
              : "Fonts are saved in this browser for next time. Nothing is uploaded."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {families.length === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <TypeIcon className="size-5" strokeWidth={1.5} />
            <p className="max-w-52 text-sm">
              Add TTF, OTF, or a ZIP to embed replacement fonts.
            </p>
          </div>
        ) : (
          <div className="max-h-[28rem] space-y-4 overflow-y-auto pe-3">
            {families.map((family) => (
              <div
                key={family.id}
                className="space-y-2 border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{family.family}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {Object.keys(family.faces).length} face
                      {Object.keys(family.faces).length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge
                    variant={family.embeddable ? "secondary" : "destructive"}
                  >
                    {permissionLabel[family.permission]}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["regular", "bold", "italic", "boldItalic"] as const).map(
                    (slot) => (
                      <Badge
                        key={slot}
                        variant={family.faces[slot] ? "outline" : "secondary"}
                      >
                        {slot === "boldItalic" ? "bold italic" : slot}
                      </Badge>
                    )
                  )}
                </div>
                {family.issues.map((issue) => (
                  <p
                    key={issue}
                    className="text-xs leading-relaxed text-destructive"
                  >
                    {issue}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {result?.rejected.length ? (
        <CardContent className="border-t pt-4">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>
              {result.rejected.length} file
              {result.rejected.length === 1 ? "" : "s"} skipped
            </AlertTitle>
            <AlertDescription>
              {result.rejected[0].fileName}: {result.rejected[0].reason}
            </AlertDescription>
          </Alert>
        </CardContent>
      ) : families.length > 0 ? (
        <CardContent className="border-t pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2Icon className="size-4 text-[var(--success)]" />
            Internal names and embedding permissions checked
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}
