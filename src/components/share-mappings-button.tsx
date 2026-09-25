import { useState } from "react"
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createMappingShareLink } from "@/lib/mappings/share-link"
import type { SavedMapping } from "@/lib/mappings/saved-mappings"

export function ShareMappingsButton({
  mappings,
}: {
  mappings: SavedMapping[]
}) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const prepareLink = () => {
    setCopied(false)
    try {
      setLink(createMappingShareLink(mappings, window.location.href))
      setError("")
    } catch (reason) {
      setLink("")
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create a share link."
      )
    }
    setOpen(true)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={prepareLink}
        disabled={!mappings.length}
      >
        <Share2Icon data-icon="inline-start" /> Share link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share font mappings</DialogTitle>
            <DialogDescription>
              This link contains {mappings.length} mapping
              {mappings.length === 1 ? "" : "s"}, including embedding choices.
              It does not contain font files. Anyone with the link can read the
              mappings.
            </DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="flex min-w-0 gap-2">
              <Input
                aria-label="Mapping share link"
                value={link}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link)
                    setCopied(true)
                    setError("")
                  } catch {
                    setError(
                      "Copy failed. Select the link and copy it manually."
                    )
                  }
                }}
              >
                {copied ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <CopyIcon data-icon="inline-start" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
