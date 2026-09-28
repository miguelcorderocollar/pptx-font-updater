import { ListIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MappingsDialogContent } from "@/components/mappings-dialog-content"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import type { SavedMapping } from "@/lib/mappings/saved-mappings"

export function ViewMappingsButton({ mappings }: { mappings: SavedMapping[] }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={!mappings.length} />
        }
      >
        <ListIcon data-icon="inline-start" /> View mappings
      </DialogTrigger>
      <MappingsDialogContent
        title="Loaded mappings"
        description={`All ${mappings.length} saved font mapping${mappings.length === 1 ? "" : "s"}, including fonts absent from loaded presentations.`}
        mappings={mappings}
      />
    </Dialog>
  )
}
