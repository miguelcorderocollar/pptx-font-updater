import { execFile } from "node:child_process"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterAll, describe, expect, it } from "vitest"

import { inspectPptx } from "@/lib/pptx/inspect"

const execFileAsync = promisify(execFile)
const repository = fileURLToPath(new URL("..", import.meta.url))
const cli = path.join(repository, "scripts/font-map-cli.mjs")
const fixture = path.join(repository, "tests/fixtures/generated-sample.pptx")
const fontDirectory = path.join(repository, "tests/fixtures/fonts")
const temporaryDirectories: string[] = []

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pptx-font-cli-"))
  temporaryDirectories.push(directory)
  return directory
}

async function runCli(...args: string[]) {
  const { stdout } = await execFileAsync(process.execPath, [cli, ...args], {
    cwd: repository,
    maxBuffer: 2_000_000,
  })
  return JSON.parse(stdout)
}

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe("font CLI", () => {
  it("plans and updates a recursive batch without overwriting outputs", async () => {
    const root = await temporaryDirectory()
    const input = path.join(root, "input")
    const output = path.join(input, "updated")
    const nested = path.join(input, "nested")
    const csv = path.join(root, "mappings.csv")
    const report = path.join(root, "report.json")
    await mkdir(nested, { recursive: true })
    await copyFile(fixture, path.join(input, "one.pptx"))
    await copyFile(fixture, path.join(nested, "two.pptx"))
    await writeFile(
      csv,
      "source,replacement,embedded_font\nArial,IBM Plex Sans,\n"
    )

    const plan = await runCli(
      "batch",
      input,
      csv,
      output,
      "--recursive",
      "--dry-run",
      "--report",
      report
    )
    expect(plan.totals).toMatchObject({
      files: 2,
      planned: 2,
      updated: 0,
      failed: 0,
    })
    expect(
      plan.files.map(
        (file: { plannedReferences: number }) => file.plannedReferences
      )
    ).toEqual([39, 39])
    await expect(
      readFile(path.join(output, "one-fonts-updated.pptx"))
    ).rejects.toThrow()

    const result = await runCli(
      "batch",
      input,
      csv,
      output,
      "--recursive",
      "--report",
      report
    )
    expect(result.totals).toMatchObject({ files: 2, updated: 2, failed: 0 })
    expect(JSON.parse(await readFile(report, "utf8")).totals.updated).toBe(2)
    const bytes = await readFile(
      path.join(output, "nested/two-fonts-updated.pptx")
    )
    const inspected = await inspectPptx(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "result.pptx"
    )
    expect(
      inspected.summary.families.some(
        (family) => family.normalizedName === "arial"
      )
    ).toBe(false)

    await expect(
      runCli("batch", input, csv, output, "--recursive")
    ).rejects.toMatchObject({
      stdout: expect.stringContaining('"failed": 2'),
    })
  }, 30_000)

  it("embeds a font through the single-file command", async () => {
    const root = await temporaryDirectory()
    const csv = path.join(root, "mappings.csv")
    const output = path.join(root, "embedded.pptx")
    await writeFile(
      csv,
      "source,replacement,embedded_font\nArial,IBM Plex Sans,IBM Plex Sans\n"
    )
    const result = await runCli(
      "transform",
      fixture,
      csv,
      output,
      fontDirectory,
      "--confirm-embedding-rights"
    )
    expect(result.report.embeddedFamilies).toEqual(["IBM Plex Sans"])
    expect(result.remainingMappedSources).toEqual([])
  }, 20_000)

  it("continues after one invalid presentation and reports failure", async () => {
    const root = await temporaryDirectory()
    const input = path.join(root, "input")
    const output = path.join(root, "output")
    const csv = path.join(root, "mappings.csv")
    await mkdir(input)
    await copyFile(fixture, path.join(input, "good.pptx"))
    await writeFile(path.join(input, "broken.pptx"), "not a PowerPoint package")
    await writeFile(csv, "source,replacement\nArial,IBM Plex Sans\n")

    const failure = await runCli("batch", input, csv, output).catch(
      (error: { stdout: string }) => JSON.parse(error.stdout)
    )
    expect(failure.totals).toMatchObject({ files: 2, updated: 1, failed: 1 })
    expect(
      failure.files.find((file: { status: string }) => file.status === "failed")
        .error
    ).toBeTruthy()
    const updated = await readFile(path.join(output, "good-fonts-updated.pptx"))
    expect(updated.byteLength).toBeGreaterThan(0)
  }, 20_000)
})
