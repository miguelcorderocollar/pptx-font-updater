# Font embedding design

## Scope

Users can add replacement fonts in four equivalent ways:

- One `.ttf` or `.otf` file
- Several font files in one picker action
- More font files in later picker or drop actions
- One `.zip` containing font files

The app builds a font library in the browser worker. It saves selected font files in browser IndexedDB when available and restores them on later visits. Users can clear both the saved and active library. It never uploads or installs the files. A ZIP is only an input container. The app never embeds the ZIP itself.

## Why this needs its own subsystem

A PowerPoint font family can have separate regular, bold, italic, and bold-italic payloads. Presentation XML points to those payloads through relationships owned by `ppt/presentation.xml`. PowerPoint-authored files commonly store the payloads as EOT-compatible `.fntdata` parts with the `application/x-fontdata` content type.

Renaming `Example.ttf` to `font1.fntdata` is not a valid implementation. The app must parse the font, enforce its embedding permissions, generate a compatible payload, update the relationship graph, and verify the package as one operation.

## Accepted and rejected inputs

The picker accepts `.ttf`, `.otf`, and `.zip`. Acceptance by extension only allows inspection. The worker still validates magic bytes and required font tables.

The first release rejects:

- WOFF, WOFF2, EOT supplied by the user, Type 1, TTC, and OTC
- Password-protected or encrypted ZIPs
- Variable fonts unless the phase-zero PowerPoint fixtures prove a stable output path
- Fonts with missing `name`, `head`, or `OS/2` tables
- Fonts with Restricted License embedding
- Fonts limited to bitmap embedding
- Any face the selected EOT writer cannot convert without rewriting its outlines

A rejected file does not invalidate other files from the same selection. The font library shows a per-file reason. ZIP entries that are not supported fonts are not extracted. Ordinary text license files are ignored, while nested archives and executable entries are reported as skipped.

## Font identity and face assignment

The filename is a label only. The worker derives identity from the OpenType tables:

1. Prefer typographic family and subfamily names.
2. Fall back to legacy family and subfamily names.
3. Read `usWeightClass`, `fsSelection`, width, and italic or oblique metadata.
4. Group by normalized internal family name.
5. Propose regular, bold, italic, and bold-italic slots.

The user may resolve ambiguous slots but cannot rename the internal family. A mapping that embeds a font must use the uploaded family's internal name as its replacement family. This prevents presentation XML from requesting one family while the payload declares another.

Deduplicate identical faces with a SHA-256 digest. If two different files claim the same family and slot, stop automatic assignment and ask the user to choose one.

## Embedding permissions

Read `OS/2.fsType` from every face. Apply the strictest permission across the faces selected for a family.

| Permission         | Product behavior                                                     |
| ------------------ | -------------------------------------------------------------------- |
| Installable        | Allow full embedding.                                                |
| Editable           | Allow full embedding.                                                |
| Preview & Print    | Allow only after a warning that the presentation may open read-only. |
| Restricted License | Block embedding with no override.                                    |
| No subsetting      | Allow because v1 embeds the complete face.                           |
| Bitmap only        | Block because v1 embeds outlines, not bitmap strikes.                |

The user must also confirm that they have the right to embed the selected files. This confirmation does not override the font's machine-readable restriction.

## Payload strategy

Version one embeds complete faces. It does not subset glyphs or rewrite the font's internal family records.

The phase-zero spike decides the converter. The first candidate is `fonteditor-core`, which supports browser-side parsing and EOT output. The test must compare its binary output against the published EOT structure and prove that current PowerPoint on macOS and Windows can open and resave a presentation containing the result.

If the candidate fails, the fallback is a small TypeScript or WebAssembly implementation that writes an uncompressed EOT wrapper around a compatible SFNT payload. The fallback still needs the same PowerPoint acceptance test. Sending fonts to a conversion API is not an acceptable silent fallback because it breaks the local-processing promise.

## Package transaction

For each embedded replacement family:

1. Convert every accepted face to a validated `.fntdata` payload.
2. Allocate collision-free `ppt/fonts/fontN.fntdata` part names.
3. Allocate collision-free relationship IDs in `ppt/_rels/presentation.xml.rels`.
4. Add one font relationship for each face.
5. Create or replace the family's `p:embeddedFont` entry and connect its available face slots.
6. Add the `fntdata` default content type if it is missing.
7. Set `embedTrueTypeFonts="1"` and declare full-font rather than subset saving.
8. Remove replaced relationships and old payloads only after the new family validates.
9. Remove an old payload only when no remaining relationship targets it.

Any failure rolls back that family's package changes. Other valid family operations may continue, but the final review must show partial failures before the download button becomes available.

## Validation

Before generating the download:

- Parse all changed XML and relationship parts.
- Check each new relationship target and content type.
- Parse every emitted EOT header and compare declared sizes with actual bytes.
- Confirm that the embedded family name matches the replacement reference.
- Confirm that each face occupies the intended style slot.
- Confirm that no blocked source file appears in the ZIP.
- Reopen the generated package and repeat structural checks.

Automated checks cannot prove that PowerPoint will render the result. Release fixtures must open and resave successfully in current PowerPoint on macOS and Windows.

## UI behavior

The presentation drop target and font drop target are separate. A `.zip` dropped on the font target means a font archive. A `.pptx` dropped there produces a local error and does not replace the active presentation.

Build the interface from shadcn components:

- `Button` and a visually hidden native file input for adding files
- `Table` for families and face slots
- `Badge` for style and permission states
- `Alert` for blocked and Preview & Print results
- `Progress` while parsing or converting
- `Dialog` for embedding-rights confirmation
- `Tooltip` for compact license and compatibility explanations
- `Sheet` for the full per-file issue list

The font panel shows family first, then four stable face slots. Adding another file updates only the affected family rows. High-frequency row changes do not animate. Buttons use the `better-ui` press treatment, and elevated drop surfaces use its layered shadow recipe with concentric inner and outer radii.

## Source notes

- [Microsoft OpenType `OS/2.fsType` embedding rules](https://learn.microsoft.com/en-us/typography/opentype/spec/os2)
- [Microsoft font redistribution and document embedding FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq)
- [Microsoft PresentationML presentation structure and embedding flag](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-presentations)
- [Microsoft Open XML embedded-font record](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.font?view=openxml-3.0.1)
- [OOXML font part content types and relationship](https://download.microsoft.com/download/e/1/4/e14fb96f-83b8-4a2a-84db-7fa8acbe061a/Office%20Open%20XML%20Part%201%20-%20Fundamentals.pdf)
- [`fonteditor-core` browser and font format support](https://github.com/kekee000/fonteditor-core)
