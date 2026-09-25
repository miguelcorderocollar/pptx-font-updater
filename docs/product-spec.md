# Product specification

## Product goal

The app takes one `.pptx`, inventories its font references, lets the user map old font families to replacements, and returns a new `.pptx` with a report of what changed. Users may add local replacement fonts so the app can embed compatible faces in the output.

The app does not upload the presentation. Vercel serves the HTML, JavaScript, CSS, and local font assets. File processing happens in a Web Worker on the user's device.

## Who it is for

The first release targets designers, brand teams, and presentation operators who need to migrate decks after a typeface or brand change. It assumes the user can open the result in desktop PowerPoint for the final visual check.

## Primary flow

1. Drop or select one `.pptx` file.
2. Validate the package before reading XML.
3. Show detected literal font families, reference counts, source categories, and embedded-font warnings.
4. Add replacement families in an editable table or import a CSV.
5. Optionally add `.ttf`, `.otf`, or `.zip` font inputs through one file, multiple files, repeated additions, or drag and drop.
6. Match uploaded font families and faces to replacement families.
7. Review unmapped families, embedding permissions, missing styles, and transformation options.
8. Create a new file without changing the original.
9. Show a result report and download button.

The app should keep the user on one screen. The content changes as the job moves through `empty`, `inspecting`, `mapping`, `transforming`, `ready`, or `failed` states. A multi-page router would add no value in the first release.

## MVP requirements

### File handling

- Accept one `.pptx` at a time.
- Reject `.ppt`, `.pptm`, `.potx`, `.ppsx`, encrypted packages, malformed ZIPs, and packages missing the required presentation parts.
- Never modify the selected file in place.
- Accept font files through repeated additions, one multi-file selection, or a ZIP. Adding more files must not discard valid fonts already in the job.
- Treat ZIPs containing fonts as untrusted archives. Reject an archive for encryption, traversal paths, duplicate normalized paths, or excessive expansion. Import valid font entries, ignore ordinary non-font files such as license text, and report nested archives or executable entries without extracting them.
- Clear the active job and its object URLs when the user removes the file or starts over.
- State plainly in the interface that processing is local.

### Inspection

- Find literal `typeface` values in XML parts across themes, presentation defaults, masters, layouts, slides, notes, charts, diagrams, and other DrawingML-bearing parts.
- Group references by normalized family name while preserving the first spelling found for display.
- Report reference counts, not character counts. The interface must use that exact language.
- Separate theme references from direct formatting.
- Treat `+mj-lt`, `+mn-lt`, `+mj-ea`, `+mn-ea`, `+mj-cs`, and `+mn-cs` as theme tokens, not installable font families.
- List embedded font declarations separately. Do not pretend the browser can identify the binary font with complete certainty from its payload alone.

### Mapping

- Match source families exactly after trimming, Unicode NFC normalization, and locale-independent case folding.
- Do not use fuzzy matching or substring replacement.
- Allow many source families to map to the same replacement.
- Require a non-empty replacement without control characters.
- Warn about duplicate or conflicting source rows.
- Import and export UTF-8 CSV with `source,replacement,embedded_font` headers. The last column is optional.
- Save mapping rows in browser storage and apply them to later presentations. Let users clear saved mappings independently of saved fonts.
- Let users share saved mappings in a URL fragment. A recipient must confirm the import; font files are not included.
- Let a replacement use references only or attach an uploaded font family for embedding.
- Group uploaded faces by their internal typographic family name. Do not trust the filename as the family name.
- Auto-assign regular, bold, italic, and bold-italic slots from font metadata, then let the user correct ambiguous assignments.
- Preserve bold, italic, font size, color, language, and other run properties by changing only font-family attributes. This is inherent in the transformation and should not be presented as a checkbox.

### Transformation

- Rewrite mapped literal font references in supported XML parts.
- Leave theme tokens unchanged. Replacing a family in the theme definition changes text that points to that theme slot.
- Leave unknown elements, attributes, relationships, media, charts, notes, macros, and custom XML untouched unless a documented operation targets them.
- Rebuild the package with the PowerPoint MIME type and a new filename such as `quarterly-report-fonts-updated.pptx`.
- Produce a report with changed reference counts by source family and part category, skipped values, warnings, and validation results.

### Uploaded and embedded fonts

- Accept `.ttf`, `.otf`, and `.zip` inputs. A face becomes embeddable only after the worker validates its internal format and PowerPoint compatibility.
- Show the internal family, subfamily, weight, italic state, variable-font state, and embedding permission for each face.
- Block fonts marked Restricted License embedding and fonts that permit bitmap embedding only. The app must not offer an override.
- Allow Preview & Print embedding only after a warning that PowerPoint may open the document read-only.
- Allow Editable and Installable embedding. Require the user to confirm that they have the right to embed the files.
- Embed complete font faces in v1. Do not subset glyphs. Subsetting adds another font-rewriting system and makes licensing and script coverage harder to verify.
- Require a compatible regular face before enabling embedding for a family. Missing bold or italic faces produce warnings because PowerPoint may synthesize or substitute those styles.
- Replace an existing embedded family and its relationships as one transaction when the mapping points to an uploaded family.
- Add a new embedded family when the replacement has no existing embedded entry.
- Remove obsolete embedded data only when the relationship graph proves that no remaining entry uses it.
- Keep font files in worker memory during a session and save selected files in browser IndexedDB for later visits when storage is available. Never install them, render them through the browser font engine, or send them to Vercel. Provide a clear-library action that removes saved and active fonts.

The detailed package changes and compatibility gate are in [Font embedding design](font-embedding.md).

## Explicit non-goals for v1

- Rendering slides in the browser
- Claiming pixel-perfect visual equivalence
- Enumerating every font installed on the user's computer
- Converting `.ppt`, `.pptm`, Keynote, Google Slides, or PDF files
- Supporting web-font formats such as WOFF or WOFF2
- Supporting font collections such as TTC or OTC in v1
- Subsetting fonts to used glyphs in v1
- Renaming a font's internal family records
- Editing theme inheritance beyond replacing literal family names
- Batch processing multiple presentations
- Saving files or mappings to a user account
- A backend, database, authentication, analytics that capture filenames, or server-side file processing

## What the app can and cannot promise

The app can promise that it changed the targeted XML references and that the output package passed structural checks.

For a font that passes the embedding checks, the app can also report which complete face payloads and relationships it added. This remains a structural claim, not proof that every PowerPoint version will load the face.

It cannot promise that every line breaks in the same place. A replacement family can have different glyph widths, weights, language coverage, or fallback behavior. The completion screen must ask the user to open the result in desktop PowerPoint and inspect it.

## Interface direction

The product should look like a focused document utility, not a marketing dashboard. Use an editorial, technical layout with a warm off-white canvas, near-black type, thin rules, and one safety-orange accent for active or risky actions. Self-host IBM Plex Sans and IBM Plex Mono so the interface does not make a third-party font request.

The memorable element is the package inspection strip: a compact horizontal view that shows `file -> scan -> map -> verify -> download`, with the active stage and counts visible. This doubles as progress feedback and orientation.

The mapping table is the main workspace. Avoid card grids around every section. Build every visual control from installed shadcn components. Native elements are fine where the platform requires them, such as a visually hidden file input, but the app must not introduce another component library.

Follow the repository's `better-ui` skill during implementation. Nested surfaces use concentric radii. Structural dividers remain borders, while elevated containers use layered shadows. High-frequency table actions respond instantly or within 150 ms. Buttons may use the prescribed `0.96` press scale unless motion would distract during a destructive or long-running action.

Suggested components:

- Drop zone and native file picker
- Progress strip
- Summary line with file size, slide count when available, literal families, and embedded families
- Filterable mapping table
- Font library panel with family grouping, face slots, permission badges, and per-file errors
- Separate presentation and font drop targets so a ZIP of fonts cannot be mistaken for a `.pptx`
- CSV import and export actions
- Warnings drawer
- Confirmation dialog for embedding rights and Preview & Print restrictions
- Result report with download and start-over actions

Desktop is the primary layout. Mobile should support inspection and simple mappings, but wide mapping tables may scroll horizontally. Every action must work with a keyboard, focus must remain visible, and status changes must use an ARIA live region.

## Success criteria

- A supported deck can complete the full flow without a network request after the app shell loads.
- Unchanged package members have byte-identical content after extraction from the rebuilt archive.
- All changed XML parts parse after transformation.
- A second inspection of the output finds no mapped source references outside documented exceptions.
- The output opens in current desktop PowerPoint on macOS and Windows for the fixture set.
- Uploaded compatible font families survive an output round trip with correct regular, bold, italic, and bold-italic relationships.
- Restricted-license fonts never reach the generated package.
- The UI stays responsive during inspection and generation.
- A failure never strands the user without an explanation and a way to start over.
