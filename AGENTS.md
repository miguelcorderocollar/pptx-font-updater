# Working with this repository

The web app and CLI use the same PPTX inspector, transformer, font parser, and CSV parser. Use the CLI for local automation. All presentation and font files stay on the machine running the command.

## Setup

Run `pnpm install` with Node.js 24. Run `pnpm test`, `pnpm lint`, and `pnpm build` after changing code.

## CLI workflow

1. Inspect a deck with `pnpm fonts:cli inspect input.pptx`. The command prints JSON with detected font families and reference counts.
2. Create a UTF-8 CSV with `source,replacement,embedded_font` headers. Leave `embedded_font` empty to change references only. When embedding, its name must match `replacement` and the font directory must contain the licensed TTF or OTF files.
3. Preview a folder job with `pnpm fonts:cli batch ./input mappings.csv ./output ./fonts --recursive --dry-run --report ./plan.json`.
4. Run the same command without `--dry-run` to write updated copies. Add `--confirm-embedding-rights` only when the operator has permission to embed the selected fonts. Add `--confirm-preview-print` only after reviewing that restriction.
5. Check the JSON report. `failed` must be zero; review `skipped` and `unmappedFamilies`. Open representative outputs in PowerPoint for visual validation.

Batch output keeps the input folder structure and adds `-fonts-updated.pptx` to each filename. Existing output files are protected unless the operator explicitly passes `--overwrite`. A batch continues after an individual file fails and exits nonzero if any file failed.

Do not commit private presentations, licensed proprietary fonts, generated outputs, or local reports. The test deck in `tests/fixtures/generated-sample.pptx` is original sample data. The IBM Plex Sans test font has its OFL license beside it.
