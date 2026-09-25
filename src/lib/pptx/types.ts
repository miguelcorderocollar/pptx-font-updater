export type FontCategory =
  | "theme"
  | "presentation"
  | "master"
  | "layout"
  | "slide"
  | "notes"
  | "chart"
  | "diagram"
  | "drawing"
  | "other"

export type FontFamilySummary = {
  displayName: string
  normalizedName: string
  referenceCount: number
  categories: Partial<Record<FontCategory, number>>
  sampleParts: string[]
}

export type EmbeddedFontSummary = {
  displayName: string
  normalizedName: string
  slots: string[]
}

export type InspectionSummary = {
  fileName: string
  fileSize: number
  packagePartCount: number
  slideCount: number
  xmlPartCount: number
  referenceCount: number
  families: FontFamilySummary[]
  themeTokens: Array<{ name: string; referenceCount: number }>
  embeddedFonts: EmbeddedFontSummary[]
}

export type FontMapping = {
  source: string
  replacement: string
  embeddedFamilyId?: string
}

export type FontFaceSlot = "regular" | "bold" | "italic" | "boldItalic"

export type EmbeddingPermission =
  "installable" | "editable" | "preview-print" | "restricted" | "bitmap-only"

export type FontFaceSummary = {
  id: string
  fileName: string
  family: string
  normalizedFamily: string
  subfamily: string
  slot: FontFaceSlot
  weight: number
  italic: boolean
  permission: EmbeddingPermission
  embeddable: boolean
  variable: boolean
  size: number
  issue?: string
}

export type FontFamilyUploadSummary = {
  id: string
  family: string
  normalizedFamily: string
  permission: EmbeddingPermission
  embeddable: boolean
  faces: Partial<Record<FontFaceSlot, FontFaceSummary>>
  issues: string[]
}

export type FontImportResult = {
  families: FontFamilyUploadSummary[]
  rejected: Array<{ fileName: string; reason: string }>
}

export type TransformReport = {
  changedReferences: number
  changedParts: number
  embeddedFamilies: string[]
  removedEmbeddedFamilies: string[]
  warnings: string[]
  outputSize: number
}

export type TransformRequest = {
  mappings: FontMapping[]
  confirmEmbeddingRights: boolean
  confirmPreviewPrint: boolean
}
