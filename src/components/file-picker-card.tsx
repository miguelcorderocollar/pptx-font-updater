import { useRef, useState } from "react"
import {
  FileArchiveIcon,
  FileType2Icon,
  PlusIcon,
  UploadCloudIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type FilePickerCardProps = {
  kind: "presentation" | "fonts"
  title: string
  description: string
  accept: string
  multiple?: boolean
  compact?: boolean
  onFiles: (files: File[]) => void
}

export function FilePickerCard({
  kind,
  title,
  description,
  accept,
  multiple = false,
  compact = false,
  onFiles,
}: FilePickerCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const Icon = compact
    ? kind === "presentation"
      ? FileType2Icon
      : FileArchiveIcon
    : UploadCloudIcon

  const receiveFiles = (list: FileList | null) => {
    if (!list?.length) return
    const files = Array.from(list).filter((file) =>
      kind === "presentation"
        ? /\.pptx$/i.test(file.name)
        : /\.(ttf|otf|zip)$/i.test(file.name)
    )
    if (files.length) onFiles(files)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <Card
      className={cn(
        "relative shadow-[var(--shadow-surface)] transition-[border-color,box-shadow,background-color] duration-150 ease-out",
        compact
          ? "gap-3 border-0 py-3"
          : "min-h-64 items-center justify-center gap-5 border-2 border-dashed border-border bg-card/70 py-8 ring-0",
        dragging &&
          (compact
            ? "bg-accent shadow-[var(--shadow-surface-hover)]"
            : "border-primary bg-accent shadow-[var(--shadow-surface-hover)]")
      )}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        receiveFiles(event.dataTransfer.files)
      }}
    >
      <CardHeader
        className={cn(
          compact
            ? "grid-cols-[auto_1fr_auto] items-center gap-x-3"
            : "w-full justify-items-center text-center"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center bg-secondary text-secondary-foreground",
            compact ? "size-9 rounded-lg" : "size-12 rounded-xl"
          )}
        >
          <Icon
            aria-hidden="true"
            className={compact ? "size-4" : "size-6"}
            strokeWidth={1.75}
          />
        </div>
        <div className={cn(!compact && "mt-2 w-full")}>
          <CardTitle>{dragging && !compact ? "Drop files to inspect" : title}</CardTitle>
          <CardDescription
            className={cn(
              "mt-1 max-w-xl leading-relaxed",
              !compact && "mx-auto text-center"
            )}
          >
            {description}
          </CardDescription>
        </div>
        {compact ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
            {kind === "fonts" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => folderInputRef.current?.click()}
              >
                Folder
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      {!compact ? (
        <CardContent className="text-center">
          <Button type="button" onClick={() => inputRef.current?.click()}>
            <UploadCloudIcon data-icon="inline-start" />
            Choose {kind === "presentation" ? "presentations" : "font files"}
          </Button>
        </CardContent>
      ) : null}
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only !size-px !w-px"
        aria-label={title}
        onChange={(event) => receiveFiles(event.currentTarget.files)}
      />
      {kind === "fonts" ? (
        <input
          ref={folderInputRef}
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          className="sr-only"
          aria-label="Choose font folder"
          onChange={(event) => receiveFiles(event.currentTarget.files)}
        />
      ) : null}
    </Card>
  )
}
