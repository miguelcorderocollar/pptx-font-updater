import { ListIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
      <DialogContent className="flex max-h-[min(80svh,44rem)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Loaded mappings</DialogTitle>
          <DialogDescription>
            All {mappings.length} saved font mapping
            {mappings.length === 1 ? "" : "s"}, including fonts absent from
            loaded presentations.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-popover">
              <TableRow>
                <TableHead>Source font</TableHead>
                <TableHead>Replacement</TableHead>
                <TableHead>Embedded font</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping) => (
                <TableRow key={mapping.source}>
                  <TableCell className="break-words whitespace-normal">
                    {mapping.source}
                  </TableCell>
                  <TableCell className="break-words whitespace-normal">
                    {mapping.replacement}
                  </TableCell>
                  <TableCell className="break-words whitespace-normal text-muted-foreground">
                    {mapping.embeddedFont || "None"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
