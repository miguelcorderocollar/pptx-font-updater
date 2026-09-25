# Implementation plan

## Current status

The browser MVP is implemented through the package transformation and embedded-font phases. Automated coverage includes an original generated sample deck, exact reference replacement, a real OFL-licensed TTF-to-EOT embed, package reopening, and a Chromium workflow test through download. The remaining release gate is manual PowerPoint open/resave validation on current macOS and Windows versions, followed by the broader browser and adversarial-file matrix in Phase 6.

## Delivery rule

Each phase must leave the repository runnable and tested. Font embedding is a core requirement, but it starts with a compatibility spike. Do not build the upload interface around an unproven font payload format.

## Phase 0: fixture and schema research

- Create small presentations in current PowerPoint for macOS and Windows when available.
- Include direct formatting, theme major/minor fonts, masters, layouts, notes, charts, diagrams, tables, bold and italic runs, non-Latin text, and an embedded font licensed for testing.
- Unzip each fixture and record which parts and relationships contain font data.
- Add a sanitized expected inventory for every fixture.
- Decide and document the exact namespace URIs and content types supported by the scanner.
- Collect licensed TTF and OTF fixtures covering regular, bold, italic, bold-italic, variable fonts, Restricted, Preview & Print, Editable, Installable, no-subsetting, and bitmap-only flags.
- Generate full, unsubsetted EOT payloads in the browser test environment and add them to a minimal presentation package.
- Open and resave those presentations in current PowerPoint on macOS and Windows.
- Select and pin the font parser and EOT writer only after the generated payloads pass.

Exit condition: the fixture matrix covers each promised source category, expected references are checked into tests, and at least one uploaded family with four faces survives a PowerPoint open and resave round trip on both operating systems.

## Phase 1: application shell

- Scaffold with `pnpm dlx shadcn@latest init --preset b0 --template vite --pointer`.
- Select Base UI, monorepo off, and RTL off.
- Use shadcn components for every visual control. Keep feature imports pointed at `@/components/ui`. TanStack Table remains a non-visual engine behind the shadcn data-table implementation.
- Add the local IBM Plex font packages and design tokens.
- Build the one-screen state layout, drop zone, progress strip, empty states, and error boundary.
- Apply the repository-local `better-ui` rules for concentric radii, surface depth, icon weight, exact transitions, and `0.96` press feedback.
- Add Vitest, Testing Library, Playwright, ESLint, and formatting commands.
- Add Vercel static build configuration and security headers.

Exit condition: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass, and the shell loads in a Vercel preview.

## Phase 2: safe package inspection

- Implement ZIP central-directory preflight and limits.
- Implement worker lifecycle and typed message validation.
- Validate package identity.
- Parse relevant XML parts by namespace and local name.
- Normalize and aggregate font references.
- Show categories, counts, theme tokens, and embedded-font warnings in the UI.

Exit condition: every fixture produces the expected inventory, malformed inputs fail with stable error codes, and inspection does not block typing or animation on the main thread.

## Phase 3: mapping and font library

- Build the TanStack Table mapping grid.
- Add exact-match validation, conflict warnings, clear-all, and unmapped filters.
- Add CSV import and export with `source,replacement,embedded_font` headers.
- Add a separate font drop target supporting one file, multiple files, repeated additions, and ZIPs.
- Parse internal font metadata and embedding permissions in the worker.
- Group faces into families and regular, bold, italic, and bold-italic slots.
- Show blocked faces, Preview & Print warnings, ambiguous assignments, duplicates, and unsupported formats without discarding valid files from the same selection.
- Let each mapping select references only or one compatible uploaded family.
- Save mappings in browser storage and restore them for later presentations, with a separate clear action.
- Add keyboard and screen-reader tests for editing and errors.

Exit condition: mappings can be created manually or round-tripped through CSV without data loss, and all three font input methods build the same normalized font library.

## Phase 4: transformation and download

- Apply literal family mappings to supported XML attributes.
- Track per-part and per-category changes.
- Parse changed parts again and inspect the generated package.
- Return a transferable output buffer and create a local download URL.
- Build the result report and start-over flow.
- Add golden tests that compare semantic XML and confirm untouched package members have byte-identical content after extraction.

Exit condition: transformed fixtures open in PowerPoint on macOS and Windows, retain charts, notes, images, and layouts, and contain the expected replacement references.

## Phase 5: embedded-font writing and cleanup

- Implement relationship graph helpers.
- Convert compatible uploaded faces into the PowerPoint-tested full EOT payload.
- Add or replace regular, bold, italic, and bold-italic face relationships as an atomic family operation.
- Update presentation XML, its embedding flags, relationships, payload members, and content types.
- Remove the old embedded family only after the replacement family validates.
- Keep shared or ambiguous payloads.
- Block prohibited embedding permissions and require confirmation for Preview & Print fonts.
- Require a user confirmation that they have embedding rights before generation.
- Test regular, bold, italic, and bold-italic payload combinations.

Exit condition: new and replaced embedded-font fixtures pass relationship and EOT integrity checks, survive PowerPoint open and resave, and never contain a blocked face.

## Phase 6: release hardening

- Test Chrome, Edge, Safari, and Firefox with small, medium, maximum-supported, malformed, and adversarial presentation and font archives.
- Measure peak worker memory and total transform time on representative hardware.
- Test cancellation at every stage.
- Test the production Content Security Policy, blob download, local fonts, and Vercel preview behavior.
- Audit all user-facing claims about privacy and validation.
- Add a short manual release checklist for PowerPoint smoke tests.

Exit condition: all automated checks pass, the browser matrix has no release blocker, and the manual PowerPoint checklist is signed off for the release commit.

## Test matrix

| Layer               | What it proves                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Unit                | Normalization, CSV parsing, ZIP preflight, path checks, mapping lookup, and report totals.                            |
| Font binary         | Naming, style classification, `fsType`, EOT headers, full payloads, duplicates, and unsupported outlines.             |
| XML fixture         | Namespace handling, theme-token behavior, exact attribute edits, embedded-family records, and serialization validity. |
| Package integration | ZIP rebuild, required members, font relationships, content types, and untouched binary bytes.                         |
| Browser             | Presentation and font drop flows, progress, editing, cancellation, failure recovery, download, keyboard use, and CSP. |
| PowerPoint smoke    | The output opens, slides remain present, charts and notes survive, substitutions match, and embedded faces load.      |

LibreOffice can catch some packaging errors, but it is not the acceptance oracle for PowerPoint behavior.

## CI and deployment gates

For each pull request:

1. Install with the frozen pnpm lockfile.
2. Run lint, type checking, unit tests, package integration tests, and the production build.
3. Create a Vercel preview through Git integration.
4. Run Playwright against the preview with public, non-sensitive fixtures.

For production, merge through the protected main branch only after the preview checks pass. Keep deployment configuration in the repository. Do not add a separate custom deployment workflow unless Git integration becomes insufficient.

## Deferred ideas

- Saved mapping presets in local storage
- Batch processing with bounded worker concurrency
- Optional local font availability hints through the CSS Font Loading API
- Glyph subsetting for fonts that permit it
- More package types after separate compatibility work
- A desktop wrapper if browser memory limits become the dominant constraint

None of these should delay a reliable single-file `.pptx` workflow.
