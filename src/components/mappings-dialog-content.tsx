import type { ReactNode } from "react"

import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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

export function MappingsDialogContent({
  title,
  description,
  mappings,
  children,
}: {
  title: string
  description: string
  mappings: SavedMapping[]
  children?: ReactNode
}) {
  return (
    <DialogContent className="flex max-h-[min(80svh,44rem)] flex-col sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
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
      {children}
    </DialogContent>
  )
}
