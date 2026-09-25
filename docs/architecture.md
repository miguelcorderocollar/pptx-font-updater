# Architecture

## Decision summary

Use a client-only React application built with Vite, TypeScript, and shadcn/ui preset `b0` on Base UI. Build visual controls from shadcn components only. Use TanStack Table behind the shadcn data-table pattern. Run PowerPoint, archive, and font work in a dedicated Web Worker. Deploy the static `dist` directory to Vercel.

This is a better fit than Next.js, Astro, or TanStack Start for this product:

| Option         | Assessment                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Vite + React   | Chosen. It has the smallest runtime model for a single client-only tool and shadcn supports it directly.                           |
| Next.js        | Valid, but its server and routing model would be unused. Static export also requires care around browser-only APIs.                |
| TanStack Start | Valid, but route loaders, server functions, and SSR do not solve a problem here. TanStack Table can be used without the framework. |
| Astro          | Strong for content-first sites. This app is one long-lived interactive workspace, so most of the page would become a React island. |

Vercel does not require Next.js. It detects Vite builds and serves their static output. The product has one route, so it does not need an SPA catch-all rewrite at first. Add the documented Vercel rewrite only if client-side routes are introduced later.

## Runtime shape

```text
Vercel CDN
  serves static HTML, JS, CSS, and self-hosted UI fonts
        |
        v
React UI on the main thread
  owns workflow state, mappings, warnings, and downloads
        |
        | typed postMessage protocol
        v
PPTX Web Worker
  preflight -> unzip -> inspect -> ingest fonts -> transform -> embed -> validate -> rezip
        |
        v
ArrayBuffer returned to the main thread for local download
```

There is no API route, Vercel Function, database, object storage bucket, or telemetry payload containing presentation data.

## Proposed source layout

```text
src/
  app/
    app.tsx
    job-reducer.ts
    job-types.ts
  components/
    file-drop-zone.tsx
    font-drop-zone.tsx
    font-library.tsx
    font-face-slots.tsx
    inspection-strip.tsx
    mapping-table.tsx
    warnings-drawer.tsx
    result-report.tsx
    ui/
  features/mappings/
    csv.ts
    mapping-schema.ts
  features/fonts/
    font-input.ts
    font-library-model.ts
  lib/pptx/
    constants.ts
    errors.ts
    package-preflight.ts
    package-reader.ts
    font-inventory.ts
    font-normalization.ts
    font-transform.ts
    embedded-font-cleanup.ts
    embedded-font-writer.ts
    package-validation.ts
    report.ts
    types.ts
  lib/fonts/
    archive-preflight.ts
    font-metadata.ts
    embedding-rights.ts
    face-classification.ts
    eot-writer.ts
  workers/
    pptx.worker.ts
    protocol.ts
  styles/
    globals.css
tests/
  fixtures/
  unit/
  integration/
  browser/
docs/
vercel.json
```

The code under `lib/pptx` and `lib/fonts` must not import React or browser UI code. Keeping the transformation core pure makes it testable in Vitest and reusable from the worker.

## UI component policy

The scaffold command is:

```sh
pnpm dlx shadcn@latest init --preset b0 --template vite --pointer
```

Use the Base UI option chosen by the preset. Feature code imports visual controls from `@/components/ui`. It must not import Base UI primitives directly or add Radix, MUI, Chakra, Headless UI, or another visual component system.

TanStack Table is allowed as the state and row-model engine used by the shadcn data-table recipe. Lucide is the single icon family. Native file inputs remain in the DOM for browser file access, wrapped by shadcn Button, Field, Label, Progress, Alert, Badge, Table, Dialog, Sheet, Tooltip, and related components.

The local `better-ui` skill governs polish. In particular, nested radii must be concentric, table dividers remain borders, elevated containers use layered shadows, icon strokes match adjacent text, and interactive transitions name exact properties. Do not add a motion library for this app. CSS transitions cover the required feedback.

## Package processing pipeline

### 1. Preflight the ZIP

Before inflating entries, read the ZIP central directory and enforce limits. Do not rely only on the compressed file size.

Initial limits should be constants with tests:

- 100 MB maximum input file
- 500 MB maximum declared uncompressed package size
- 10,000 maximum entries
- 20 MB maximum individual XML part
- Reject encrypted entries
- Reject absolute paths, traversal paths, NUL bytes, and duplicate normalized paths
- Reject extreme declared compression ratios

These are product guardrails, not proof that an arbitrary hostile archive is safe. The worker boundary limits UI damage. Terminating and recreating the worker is the cancellation and hard-failure mechanism.

### 2. Validate the package identity

Require `[Content_Types].xml`, `_rels/.rels`, and `ppt/presentation.xml`. Confirm the presentation main-part content type. Do not accept a file because its extension happens to be `.pptx`.

### 3. Read only relevant text parts

Use JSZip for package loading and generation. Binary members remain untouched in memory and are copied into the generated archive. Decode XML and relationship files as UTF-8 only when needed.

Use `@xmldom/xmldom` inside the worker for namespace-aware DOM parsing and serialization. Reject `DOCTYPE` declarations before parsing. Walk elements and attributes by namespace URI and local name, not by assumed prefixes such as `a:` or `p:`. Prefixes can legally differ between producers.

Serialization can change whitespace, quote style, or namespace formatting inside modified XML parts. This is acceptable if the result is equivalent and valid. Unmodified package members should never pass through an XML serializer.

### 4. Build the font inventory

Inspect `typeface` attributes in DrawingML-aware XML. Classify each reference from its package path and ancestor context:

- Theme major and minor families
- Presentation defaults
- Slide master
- Slide layout
- Slide
- Notes master and notes slide
- Chart
- Diagram and drawing
- Embedded font declaration
- Other XML

The inventory stores aggregate counts and a small sample of part paths for the UI. It does not send every occurrence to React for large decks.

Each internal reference records enough information to find the node again during the same worker job. The public summary uses serializable values only.

```ts
type FontFamilySummary = {
  displayName: string
  normalizedName: string
  referenceCount: number
  categories: Partial<Record<FontCategory, number>>
  sampleParts: string[]
  embedded: boolean
}
```

### 5. Ingest replacement font files

Accept one or many `.ttf` and `.otf` files, or a `.zip` containing them. Users can add files repeatedly. The worker keeps a job-scoped font library and deduplicates faces by a hash of their bytes, not by filename.

Font ZIPs have separate limits from presentations. Start with 100 files, 100 MB compressed, 250 MB declared uncompressed, 30 MB per face, no nested archives, and no non-font payload extraction. Apply the same path and encryption checks as the presentation preflight.

Parse each face's internal naming table, `OS/2` table, weight, width, italic flags, outline type, and variable-font tables. Use typographic family and subfamily names when present, then fall back to legacy family names. Classify faces into regular, bold, italic, and bold-italic slots. Ambiguous or duplicate assignments require user review.

Interpret `OS/2.fsType` before enabling embedding. Restricted and bitmap-only faces are blocked. Preview & Print faces require an explicit warning. Editable and Installable faces are allowed. Keep this decision in the report.

Do not register uploaded files with the browser `FontFace` API in v1. Font parsing stays in the worker and never invokes the browser's font renderer.

### 6. Apply mappings

Normalize the source side once, build a `Map<string, Replacement>`, and traverse supported XML parts. Change only matching literal `typeface` attribute values. XML serialization handles escaping.

Do not replace values inside arbitrary text nodes, filenames, relationship targets, or binary data. Do not replace theme tokens. Do not perform case-sensitive substring operations.

The transformer returns a change record for every modified part and aggregate totals for the report. It writes a package member only when at least one value changed.

### 7. Write embedded fonts

PowerPoint-authored presentations commonly store each embedded face as an EOT-compatible `.fntdata` part with content type `application/x-fontdata`. Raw font bytes cannot simply be renamed and assumed to work.

The browser implementation will generate a full, unsubsetted EOT payload from each compatible SFNT face. Phase 0 must prove the chosen converter against PowerPoint on macOS and Windows before the dependency becomes final. `fonteditor-core` is the first candidate because it parses and writes TTF, OTF, and EOT in browser environments. If its output fails the fixture test, implement the small uncompressed EOT wrapper from the published format with dedicated binary fixtures. Do not move conversion to a server without revisiting the privacy model with the user.

For each family, add or replace:

- A `p:embeddedFont` record with internal family metadata
- `p:regular`, `p:bold`, `p:italic`, and `p:boldItalic` references for available faces
- Presentation relationships of type `.../relationships/font`
- Unique `ppt/fonts/fontN.fntdata` package members
- The `fntdata` content type when missing
- `embedTrueTypeFonts="1"` and the full-font save setting on the presentation

The package mutation is atomic per family. If conversion, relationship allocation, XML insertion, or validation fails, retain the original embedded family and report the failure.

### 8. Clean obsolete embedded fonts

Keep this as an isolated package transaction, not a special case inside the attribute walker.

The cleanup module resolves relationships from `ppt/presentation.xml.rels`, finds the IDs used by matching embedded-font records, removes those records and relationships, and deletes a payload only after checking that no remaining relationship targets it. It then updates `[Content_Types].xml` when needed.

If any relationship or content-type state is ambiguous, abort cleanup for that font and retain all of its data. Ordinary reference replacement can still finish. The report must say that cleanup was skipped.

### 9. Validate before download

Validation is a separate pass:

- Parse every changed XML part again.
- Confirm required package members still exist.
- Confirm every relationship removed by embedded cleanup has no remaining owner reference.
- Confirm every deleted payload has no remaining relationship target.
- Parse each emitted EOT header and verify its declared sizes against the generated part.
- Re-read every new embedded-font relationship and confirm its target, content type, face slot, and family metadata.
- Confirm blocked font files did not enter the package.
- Re-scan changed parts for mapped source families and list any intentional exceptions.
- Generate the ZIP as a Blob or transferable `ArrayBuffer` with the PowerPoint MIME type.
- Load the generated archive once more and repeat the cheap structural checks.

Package validation does not replace opening the result in PowerPoint.

## Worker protocol

Use a discriminated union shared by the UI and worker.

Commands:

- `inspect(jobId, file)`
- `addFonts(jobId, files)`
- `removeFont(jobId, fontId)`
- `transform(jobId, mappings, options)`
- `dispose(jobId)`

Events:

- `progress(jobId, stage, completed, total, currentPart?)`
- `inspectionReady(jobId, summary)`
- `fontLibraryChanged(jobId, families, issues)`
- `transformReady(jobId, output, report)`
- `failed(jobId, code, safeMessage, detail?)`

The worker keeps the loaded package between inspection and transformation. The main thread receives only summaries until the output is ready. A new file disposes the old worker and creates another one, which releases package memory and gives cancellation predictable semantics.

Do not send raw XML, filenames from internal package parts, or stack traces to analytics. The first release should have no product analytics at all.

## Client state

Use a reducer with an explicit state union instead of a global state package:

```ts
type JobState =
  | { status: "empty" }
  | { status: "inspecting"; file: File; progress: Progress }
  | {
      status: "mapping"
      file: FileMeta
      summary: InspectionSummary
      rows: MappingRow[]
      fonts: FontLibrarySummary
    }
  | { status: "transforming"; file: FileMeta; progress: Progress }
  | {
      status: "ready"
      file: FileMeta
      report: TransformReport
      downloadUrl: string
    }
  | { status: "failed"; file?: FileMeta; error: UserFacingError }
```

Impossible transitions should fail in development. Object URLs must be revoked on replacement and unmount.

## Dependencies

Keep the runtime list short:

- `react` and `react-dom`
- shadcn components generated with the Base UI option
- `@tanstack/react-table` for sorting, filtering, and row models
- `jszip` for reading and generating the package
- `@xmldom/xmldom` for worker-compatible XML DOM parsing
- `papaparse` for quoted CSV import and export
- `zod` for worker messages, mapping input, and CSV row validation
- A font parser and EOT writer selected only after the phase-zero PowerPoint compatibility spike
- `@fontsource-variable/ibm-plex-sans` and `@fontsource/ibm-plex-mono` for local UI fonts

Do not add React Query, a form framework, a client store, a router, or a server SDK until a real requirement needs one.

## Vercel deployment

Vercel should detect Vite with these settings:

```text
Install command: pnpm install --frozen-lockfile
Build command:   pnpm build
Output:          dist
```

Pin the pnpm version through the `packageManager` field. Connect the Git repository to Vercel so pull requests receive preview deployments. Production comes from the protected main branch after checks pass.

`vercel.json` should set security headers for static responses. Start with `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and a Content Security Policy that permits only same-origin scripts, workers, styles, and fonts. The final CSP must be tested against Vite's production output and blob downloads.

Do not add an SPA rewrite while the app has only `/`. If routes arrive later, add Vercel's documented rewrite to `/index.html` and test deep links in a preview deployment.

The privacy statement should say that presentation processing is local. It should not claim the browser makes zero network requests, because loading the site and any Vercel observability the team later enables are network activity. Do not enable Web Analytics or Speed Insights without revisiting that statement.

## Risks and mitigations

| Risk                                                                 | Response                                                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser memory spikes on large decks                                 | Central-directory limits, a worker, aggregate results, one active file, and clear size errors.                                                  |
| Invalid package after XML edits                                      | Namespace-aware parsing, changed-part validation, output re-open, fixture tests, and PowerPoint smoke tests.                                    |
| Theme fonts reported as literal fonts                                | Classify theme tokens separately and change theme definitions rather than tokens.                                                               |
| Embedded font replacement breaks relationships                       | Replace each family atomically, delete old payloads only after validation, and keep data on ambiguity. Standalone cleanup stays off by default. |
| A generated font part passes local parsing but PowerPoint rejects it | Phase-zero EOT fixture spike, binary round-trip checks, and PowerPoint tests on macOS and Windows.                                              |
| A font license forbids embedding                                     | Parse `OS/2.fsType`, block restricted and bitmap-only faces, warn for Preview & Print, and record the decision.                                 |
| A font ZIP expands into hostile or excessive content                 | Separate ZIP limits, central-directory preflight, accepted-extension filtering, and no nested archives.                                         |
| A malformed font attacks the browser font renderer                   | Parse in the worker and do not load uploaded fonts through `FontFace` in v1.                                                                    |
| Replacement font is missing                                          | Explain that PowerPoint may substitute it. Browser font detection is advisory at best and not part of v1.                                       |
| CSV parser corrupts quoted names                                     | Use a real CSV parser and a fixed two-column schema.                                                                                            |
| UI freezes                                                           | Do decompression, XML traversal, validation, and compression in the worker.                                                                     |
| False privacy claim                                                  | Say the file is not uploaded. Keep presentation data out of APIs and analytics.                                                                 |
| A generated file opens but looks different                           | Report structural success only and require a visual check in PowerPoint.                                                                        |

## Source notes

- [shadcn supports Vite, Next.js, TanStack Start, React Router, and Astro](https://ui.shadcn.com/docs/installation)
- [Vite installation for shadcn](https://ui.shadcn.com/docs/installation/vite)
- [Vercel's Vite deployment guidance](https://vercel.com/docs/frameworks/frontend/vite)
- [Next.js static export browser API constraints](https://nextjs.org/docs/app/guides/static-exports)
- [TanStack Start SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode)
- [JSZip load behavior and path sanitization](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html)
- [JSZip browser memory limitations](https://stuk.github.io/jszip/documentation/limitations.html)
- [Microsoft Open XML embedded-font model](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.font?view=openxml-3.0.1)
- [Microsoft OpenType embedding permissions in `OS/2.fsType`](https://learn.microsoft.com/en-us/typography/opentype/spec/os2)
- [Microsoft PresentationML embedding flag](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-presentations)
- [OOXML font part content types and relationship](https://download.microsoft.com/download/e/1/4/e14fb96f-83b8-4a2a-84db-7fa8acbe061a/Office%20Open%20XML%20Part%201%20-%20Fundamentals.pdf)
