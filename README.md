# PPTX Font Updater

A browser-only React tool for replacing font references in `.pptx` files and optionally embedding uploaded font files. Presentations and fonts stay in the browser; the Vercel deployment is static and has no upload API.

## What works

- Inspect font references across themes, masters, layouts, slides, notes, charts, diagrams, and drawings
- Edit exact family mappings in a shadcn table
- Import and export `source,replacement,embedded_font` CSV mappings
- Save mapping rows in this browser and apply them to later presentations
- Share saved mappings through a link; recipients review and import them into their own browser
- Clear saved mappings independently of the font library
- Add one or many `.ttf` or `.otf` files, repeatedly or inside a `.zip`
- Read internal family/style metadata and `OS/2.fsType` embedding permissions
- Keep selected font files in this browser with IndexedDB and restore them on return
- Clear the saved font library without clearing selected presentations
- Group regular, bold, italic, and bold-italic faces
- Block Restricted and bitmap-only embedding; require confirmation for Preview & Print fonts
- Convert supported static faces to EOT-compatible `.fntdata`
- Update presentation XML, relationships, content types, and embedding flags
- Reopen and structurally validate the generated package before download

The transformer edits OOXML directly instead of rebuilding slides, which minimizes changes to layouts, images, charts, notes, and relationships.

### Process presentations from the command line

The CLI uses the same inspector, transformer, font parser, and CSV validation as the app. It accepts `source,replacement,embedded_font` CSV files. When embedding, the font directory should contain matching OTF or TTF files. The CLI scans font subdirectories too.

```sh
pnpm fonts:cli inspect input.pptx
pnpm fonts:cli transform input.pptx mappings.csv output.pptx /path/to/fonts --confirm-embedding-rights
pnpm fonts:cli batch ./input mappings.csv ./output /path/to/fonts --recursive --dry-run --report ./plan.json
pnpm fonts:cli batch ./input mappings.csv ./output /path/to/fonts --recursive --confirm-embedding-rights --report ./result.json
```

For references-only mappings, omit the font directory and confirmation flag. Batch writes a separate copy of each matching deck, preserves subdirectories, and continues past individual failures. It prints a JSON report and exits nonzero if any file fails. `--dry-run` writes no PPTX files. Outputs are protected from accidental overwrites; use `--overwrite` only when you intend to replace them. `--fail-on-unmapped` makes any detected family without a mapping an error. The single-file transform also reports mapped source names that remain in the output.

Agents can follow the repository workflow in [AGENTS.md](AGENTS.md).

## Stack

- Vite, React 19, and TypeScript
- shadcn/ui preset `b0` with Base UI and pointer cursors
- TanStack Table behind shadcn table components
- JSZip, `@xmldom/xmldom`, and `fonteditor-core`
- A dedicated Web Worker for package and font processing
- Vitest and Playwright
- Static Vercel hosting with security headers in `vercel.json`

The project was scaffolded with:

```sh
pnpm dlx shadcn@latest init --preset b0 --template vite --pointer
```

## Run locally

```sh
pnpm install
pnpm dev
```

Quality checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The integration suite uses an original sample deck at `tests/fixtures/generated-sample.pptx`. Its embedding test uses an OFL-licensed IBM Plex Sans font stored alongside its license.

## Deployment

Import the repository into Vercel as a Vite project. The standard build command is `pnpm build` and the output directory is `dist`. No environment variables or managed services are required.

## Important limits

- `.pptx` only
- 100 MB maximum presentation input and 500 MB declared expanded package size
- Static TTF and OTF faces only; variable fonts are reported but not embedded
- Font ZIPs are limited to 100 files and 250 MB declared expanded size; each face is limited to 30 MB
- The browser cannot guarantee installed-font availability or a PowerPoint-accurate preview
- Structural validation does not replace opening the result in desktop PowerPoint

PowerPoint compatibility still needs a manual open/resave smoke test on current Windows and macOS releases before treating the tool as production-grade for critical decks.

## Design documents

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Font embedding design](docs/font-embedding.md)
- [Implementation and release plan](docs/implementation-plan.md)

The repository-local `better-ui` and `better-layout` skills are installed under `.agents/skills` and tracked by `skills-lock.json`.
