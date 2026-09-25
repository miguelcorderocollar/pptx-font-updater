#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { createServer } from "vite"

const usage = `Usage:
  pnpm fonts:cli inspect <input.pptx>
  pnpm fonts:cli transform <input.pptx> <mappings.csv> <output.pptx> [fonts-directory] [options]
  pnpm fonts:cli batch <input-directory> <mappings.csv> <output-directory> [fonts-directory] [options]

Options:
  --recursive                 Include subdirectories in batch jobs
  --dry-run                   Report planned changes without writing PPTX files
  --report <file.json>        Write the JSON result to a file
  --overwrite                 Replace existing output PPTX files
  --fail-on-unmapped          Fail when a detected font family has no mapping
  --confirm-embedding-rights  Confirm permission to embed selected font files
  --confirm-preview-print     Accept Preview & Print font restrictions
  --help                      Show this help`

function parseArgs(argv) {
  const options = {
    recursive: false,
    dryRun: false,
    overwrite: false,
    failOnUnmapped: false,
    confirmEmbeddingRights: false,
    confirmPreviewPrint: false,
    report: null,
  }
  const flags = new Map([
    ["--recursive", "recursive"],
    ["--dry-run", "dryRun"],
    ["--overwrite", "overwrite"],
    ["--fail-on-unmapped", "failOnUnmapped"],
    ["--confirm-embedding-rights", "confirmEmbeddingRights"],
    ["--confirm-preview-print", "confirmPreviewPrint"],
  ])
  const positionals = []
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === "--help" || value === "-h") return { help: true }
    if (value === "--report") {
      options.report = argv[++index]
      if (!options.report || options.report.startsWith("--")) {
        throw new Error("--report needs a file path.")
      }
    } else if (flags.has(value)) {
      options[flags.get(value)] = true
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`)
    } else {
      positionals.push(value)
    }
  }
  const [command, ...paths] = positionals
  if (
    !["inspect", "transform", "batch"].includes(command) ||
    (command === "inspect" && paths.length !== 1) ||
    (command !== "inspect" && (paths.length < 3 || paths.length > 4))
  ) {
    throw new Error(
      "Choose inspect, transform, or batch with the required paths."
    )
  }
  if (command !== "batch" && options.recursive) {
    throw new Error("--recursive is only valid for batch jobs.")
  }
  if (command === "inspect" && Object.values(options).some(Boolean)) {
    throw new Error("inspect does not accept transform options.")
  }
  if (options.dryRun && options.overwrite) {
    throw new Error("--overwrite has no effect with --dry-run.")
  }
  return { command, paths, options }
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )
}

async function walk(directory, extension, recursive, excluded = "") {
  const files = []
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (recursive && fullPath !== excluded) await visit(fullPath)
      } else if (entry.isFile() && extension.test(entry.name)) {
        files.push(fullPath)
      }
    }
  }
  await visit(directory)
  return files
}

async function loadFonts(directory, parseFontFace) {
  const families = new Map()
  if (!directory) return families
  for (const file of await walk(
    path.resolve(directory),
    /\.(ttf|otf)$/i,
    true
  )) {
    const face = await parseFontFace(
      path.basename(file),
      toArrayBuffer(await readFile(file))
    )
    const id = face.summary.normalizedFamily
    const faces = families.get(id) ?? []
    faces.push(face)
    families.set(id, faces)
  }
  return families
}

function selectMappings(csvMappings, detected, normalizeFontFamily) {
  const names = new Set(detected.map((family) => family.normalizedName))
  return csvMappings
    .filter(
      (row) =>
        row.replacement &&
        names.has(normalizeFontFamily(row.source)) &&
        normalizeFontFamily(row.source) !== normalizeFontFamily(row.replacement)
    )
    .map((row) => ({
      source: row.source,
      replacement: row.replacement,
      embeddedFamilyId: row.embeddedFont
        ? normalizeFontFamily(row.embeddedFont)
        : undefined,
    }))
}

async function processFile(input, output, context) {
  const {
    csvMappings,
    fontFamilies,
    options,
    inspectPptx,
    transformPptx,
    normalizeFontFamily,
  } = context
  const inspected = await inspectPptx(
    toArrayBuffer(await readFile(input)),
    path.basename(input)
  )
  const mappings = selectMappings(
    csvMappings,
    inspected.summary.families,
    normalizeFontFamily
  )
  const mapped = new Set(mappings.map((row) => normalizeFontFamily(row.source)))
  const unmappedFamilies = inspected.summary.families
    .filter((family) => !mapped.has(family.normalizedName))
    .map((family) => family.displayName)
  const base = {
    input,
    output,
    mappings: mappings.length,
    plannedReferences: inspected.summary.families
      .filter((family) => mapped.has(family.normalizedName))
      .reduce((total, family) => total + family.referenceCount, 0),
    unmappedFamilies,
  }
  if (options.failOnUnmapped && unmappedFamilies.length) {
    throw new Error(`Unmapped font families: ${unmappedFamilies.join(", ")}`)
  }
  if (!mappings.length)
    return { ...base, status: "skipped", reason: "No matching mappings." }
  if (input === output)
    throw new Error("Output path must differ from input path.")
  for (const mapping of mappings) {
    if (
      mapping.embeddedFamilyId &&
      !fontFamilies.has(mapping.embeddedFamilyId)
    ) {
      throw new Error(`Missing font files for ${mapping.replacement}.`)
    }
  }
  if (options.dryRun) return { ...base, status: "planned" }

  const result = await transformPptx(
    inspected.zip,
    path.basename(input),
    {
      mappings,
      confirmEmbeddingRights: options.confirmEmbeddingRights,
      confirmPreviewPrint: options.confirmPreviewPrint,
    },
    fontFamilies
  )
  const after = await inspectPptx(result.output, path.basename(output))
  const remainingMappedSources = after.summary.families
    .filter((family) => mapped.has(family.normalizedName))
    .map((family) => family.displayName)
  if (remainingMappedSources.length) {
    throw new Error(
      `Mapped source fonts remain: ${remainingMappedSources.join(", ")}`
    )
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, Buffer.from(result.output), {
    flag: options.overwrite ? "w" : "wx",
  })
  return {
    ...base,
    status: "updated",
    report: result.report,
    remainingMappedSources,
  }
}

async function saveReport(reportPath, result) {
  if (!reportPath) return
  await mkdir(path.dirname(path.resolve(reportPath)), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`)
}

async function run() {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`${error.message}\n\n${usage}`)
    process.exitCode = 2
    return
  }
  if (parsed.help) {
    console.log(usage)
    return
  }

  const { command, paths, options } = parsed
  const server = await createServer({
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  })
  try {
    const [
      { inspectPptx },
      { transformPptx },
      { parseFontFace },
      { parseMappingCsv },
      { normalizeFontFamily },
    ] = await Promise.all([
      server.ssrLoadModule("/src/lib/pptx/inspect.ts"),
      server.ssrLoadModule("/src/lib/pptx/transform.ts"),
      server.ssrLoadModule("/src/lib/fonts/font-metadata.ts"),
      server.ssrLoadModule("/src/lib/mappings/csv.ts"),
      server.ssrLoadModule("/src/lib/pptx/font-normalization.ts"),
    ])

    if (command === "inspect") {
      const input = path.resolve(paths[0])
      const result = await inspectPptx(
        toArrayBuffer(await readFile(input)),
        path.basename(input)
      )
      console.log(JSON.stringify(result.summary, null, 2))
      return
    }

    const [inputPath, csvPath, outputPath, fontDirectory] = paths
    if (
      options.report &&
      [inputPath, csvPath, outputPath].some(
        (file) => path.resolve(file) === path.resolve(options.report)
      )
    ) {
      throw new Error(
        "Report path must differ from the input, CSV, and output paths."
      )
    }
    const csvMappings = parseMappingCsv(await readFile(csvPath, "utf8"))
    if (
      csvMappings.some((row) => row.embeddedFont) &&
      !options.dryRun &&
      !options.confirmEmbeddingRights
    ) {
      throw new Error(
        "Confirm permission to embed fonts with --confirm-embedding-rights."
      )
    }
    const fontFamilies = await loadFonts(fontDirectory, parseFontFace)
    const context = {
      csvMappings,
      fontFamilies,
      options,
      inspectPptx,
      transformPptx,
      normalizeFontFamily,
    }

    if (command === "transform") {
      const row = await processFile(
        path.resolve(inputPath),
        path.resolve(outputPath),
        context
      )
      await saveReport(options.report, row)
      console.log(JSON.stringify(row, null, 2))
      if (row.status === "skipped") process.exitCode = 1
      return
    }

    const inputRoot = path.resolve(inputPath)
    const outputRoot = path.resolve(outputPath)
    if (inputRoot === outputRoot)
      throw new Error("Input and output directories must differ.")
    const inputs = await walk(
      inputRoot,
      /\.pptx$/i,
      options.recursive,
      outputRoot
    )
    if (!inputs.length)
      throw new Error("No .pptx files found in the input directory.")
    const rows = []
    const reservedOutputs = new Set()
    for (const input of inputs) {
      const relative = path.relative(inputRoot, input)
      const output = path.join(
        outputRoot,
        path.dirname(relative),
        `${path.basename(relative).replace(/\.pptx$/i, "")}-fonts-updated.pptx`
      )
      try {
        const key = output.toLocaleLowerCase("en-US")
        if (reservedOutputs.has(key))
          throw new Error("Output filename collision.")
        reservedOutputs.add(key)
        rows.push(await processFile(input, output, context))
      } catch (error) {
        rows.push({
          input,
          output,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    const result = {
      schemaVersion: 1,
      mode: "batch",
      dryRun: options.dryRun,
      totals: {
        files: rows.length,
        updated: rows.filter((row) => row.status === "updated").length,
        planned: rows.filter((row) => row.status === "planned").length,
        skipped: rows.filter((row) => row.status === "skipped").length,
        failed: rows.filter((row) => row.status === "failed").length,
      },
      files: rows,
    }
    await saveReport(options.report, result)
    console.log(JSON.stringify(result, null, 2))
    if (result.totals.failed) process.exitCode = 1
  } finally {
    await server.close()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
