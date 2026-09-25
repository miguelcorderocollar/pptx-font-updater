import { expect, test } from "@playwright/test"
import { fileURLToPath } from "node:url"
import { readFile } from "node:fs/promises"
import JSZip from "jszip"

const presentationPath = fileURLToPath(
  new URL("../fixtures/generated-sample.pptx", import.meta.url)
)
const fontPath = fileURLToPath(
  new URL("../fixtures/fonts/IBMPlexSans-Regular.ttf", import.meta.url)
)

test("inspects, maps, embeds, and downloads the sample presentation", async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  await page.goto("/")
  await expect(page).toHaveTitle("PPTX Font Updater")
  await expect(
    page.getByRole("heading", { name: "PPTX Font Updater" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Info" }).click()
  await expect(
    page.getByRole("dialog", { name: "About PPTX Font Updater" })
  ).toBeVisible()
  await expect(
    page
      .getByRole("dialog", { name: "About PPTX Font Updater" })
      .getByText("Nothing is uploaded.")
  ).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0)
  await page.screenshot({
    path: "/tmp/pptx-font-updater-desktop.png",
    fullPage: true,
  })

  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await expect(
    page.getByText("generated-sample.pptx", { exact: true })
  ).toBeVisible()
  await expect(page.getByText("3 slides")).toBeVisible()
  await expect(page.getByLabel("Replacement for Arial")).toBeVisible()
  const loadedLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    body: Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    ),
  }))
  expect(loadedLayout.body).toBeLessThanOrEqual(loadedLayout.viewport)

  await page.getByLabel("Add font files").setInputFiles(fontPath)
  await expect(page.getByText("IBM Plex Sans", { exact: true })).toBeVisible()
  await page.getByLabel("Embedded font for Arial").click()
  await page.getByRole("option", { name: "IBM Plex Sans" }).click()
  await page.getByText("I have permission to embed these font files.").click()

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Generate PPTX" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(
    "generated-sample-fonts-updated.pptx"
  )
  expect(await download.path()).toBeTruthy()
  await expect(page.getByText("Validated PPTX downloaded")).toBeVisible()
  const embeddedCopy = await readFile(await download.path())
  await page.getByLabel("Add presentations").setInputFiles({
    name: download.suggestedFilename(),
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: embeddedCopy,
  })
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "IBM Plex Sans" })
      .getByText("Embedded", { exact: true })
  ).toBeVisible()
  const batchDownloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Generate ZIP" }).click()
  const batchDownload = await batchDownloadPromise
  const batch = await JSZip.loadAsync(
    await readFile(await batchDownload.path())
  )
  const untouched = await batch
    .file("generated-sample-fonts-updated-fonts-updated.pptx")!
    .async("nodebuffer")
  expect(untouched.equals(embeddedCopy)).toBe(true)
  await page.screenshot({
    path: "/tmp/pptx-font-updater-loaded.png",
    fullPage: true,
  })
  expect(pageErrors).toEqual([])
})

test("keeps the upload screen usable at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "PPTX Font Updater" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Info" }).click()
  await expect(
    page.getByRole("dialog", { name: "About PPTX Font Updater" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Choose presentations" })
  ).toBeVisible()
  await page.screenshot({
    path: "/tmp/pptx-font-updater-mobile.png",
    fullPage: true,
  })

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    body: Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    ),
  }))
  expect(layout.body).toBeLessThanOrEqual(layout.viewport)
})

test("start over keeps saved mappings for another presentation", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await expect(page.getByLabel("Replacement for Arial")).toBeVisible()
  await page.getByLabel("Replacement for Arial").fill("IBM Plex Sans")

  await page.getByRole("button", { name: "Start over" }).click()
  await expect(
    page.getByRole("button", { name: "Choose presentations" })
  ).toBeVisible()
  await expect(page.getByLabel("Replacement for Arial")).toHaveCount(0)

  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await expect(page.getByLabel("Replacement for Arial")).toHaveValue(
    "IBM Plex Sans"
  )
})

test("saves all imported CSV rows and clears them on request", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await page.getByRole("button", { name: "Paste CSV" }).click()
  await page
    .getByLabel("CSV mappings")
    .fill(
      "source,replacement,embedded_font\nArial,IBM Plex Sans,IBM Plex Sans\nUnused Family,Example Sans,"
    )
  await page.getByRole("button", { name: "Apply mappings" }).click()
  await expect(page.getByLabel("Replacement for Arial")).toHaveValue(
    "IBM Plex Sans"
  )
  await expect(page.getByText("Font files needed")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Generate PPTX" })
  ).toBeDisabled()
  await page.getByLabel("Add font files").setInputFiles(fontPath)
  await expect(page.getByText("Font files needed")).toHaveCount(0)
  await expect(page.getByLabel("Embedded font for Arial")).toContainText(
    "IBM Plex Sans"
  )

  await page.getByRole("button", { name: "Start over" }).click()
  await expect(page.getByText("2 font replacements ready")).toBeVisible()
  await page.reload()
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await expect(page.getByLabel("Replacement for Arial")).toHaveValue(
    "IBM Plex Sans"
  )
  await expect(page.getByLabel("Embedded font for Arial")).toContainText(
    "IBM Plex Sans"
  )
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export CSV" }).click()
  const download = await downloadPromise
  expect(await readFile(await download.path(), "utf8")).toContain(
    "Unused Family,Example Sans"
  )
  expect(await readFile(await download.path(), "utf8")).toContain(
    "Arial,IBM Plex Sans,IBM Plex Sans"
  )

  await page.getByRole("button", { name: "Clear mappings" }).click()
  await expect(page.getByLabel("Replacement for Arial")).toHaveValue("")
  await expect(page.getByText("IBM Plex Sans", { exact: true })).toBeVisible()
  await page.reload()
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await expect(page.getByLabel("Replacement for Arial")).toHaveValue("")
})

test("shares saved CSV mappings in a link and imports them on another browser", async ({
  page,
  browser,
}) => {
  await page.goto("/")
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await page.getByRole("button", { name: "Paste CSV" }).click()
  await page
    .getByLabel("CSV mappings")
    .fill(
      "source,replacement,embedded_font\nArial,IBM Plex Sans,IBM Plex Sans\nUnused Family,Example Sans,"
    )
  await page.getByRole("button", { name: "Apply mappings" }).click()
  await page.getByRole("button", { name: "Share link" }).click()
  const link = await page.getByLabel("Mapping share link").inputValue()
  expect(link).toContain("#m=")
  expect(link).not.toContain("IBM%20Plex")
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.getByRole("button", { name: "Copy", exact: true }).click()
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link)

  const recipientContext = await browser.newContext()
  try {
    const recipient = await recipientContext.newPage()
    await recipient.goto(link)
    await expect(
      recipient.getByRole("dialog", { name: "Import shared mappings" })
    ).toBeVisible()
    await expect(
      recipient.getByText("2 font mappings in this link.")
    ).toBeVisible()
    await recipient.getByRole("button", { name: "Cancel" }).click()
    await expect(recipient.getByText("Saved mappings")).toHaveCount(0)
    expect(new URL(recipient.url()).hash).toBe("")

    await recipient.goto(link)
    await recipient.getByRole("button", { name: "Import mappings" }).click()
    await expect(recipient.getByText("2 font replacements ready")).toBeVisible()
    await recipient.reload()
    await recipient
      .getByLabel("Drop PowerPoint files here")
      .setInputFiles(presentationPath)
    await expect(recipient.getByLabel("Replacement for Arial")).toHaveValue(
      "IBM Plex Sans"
    )
    await expect(recipient.getByText("Font files needed")).toBeVisible()
    await recipient.getByRole("button", { name: "Share link" }).click()
    expect(
      await recipient.getByLabel("Mapping share link").inputValue()
    ).toContain("#m=")
  } finally {
    await recipientContext.close()
  }
})

test("restores saved fonts and clears them on request", async ({ page }) => {
  await page.goto("/")
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await page.getByLabel("Add font files").setInputFiles(fontPath)
  await expect(page.getByText("IBM Plex Sans", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Start over" }).click()
  await expect(
    page.getByRole("button", { name: "Choose presentations" })
  ).toBeVisible()
  await expect(page.getByText("IBM Plex Sans", { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText("IBM Plex Sans", { exact: true })).toBeVisible()
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await page.getByLabel("Embedded font for Arial").click()
  await page.getByRole("option", { name: "IBM Plex Sans" }).click()
  await expect(page.getByLabel("Replacement for Arial")).toHaveValue(
    "IBM Plex Sans"
  )

  await page.getByRole("button", { name: "Clear", exact: true }).click()
  await expect(page.getByText("IBM Plex Sans", { exact: true })).toHaveCount(0)
  await expect(page.getByLabel("Embedded font for Arial")).toContainText(
    "References only"
  )
  await expect(page.getByText("Font files needed")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Generate PPTX" })
  ).toBeDisabled()
  await page.reload()
  await expect(
    page
      .getByText("Font library", { exact: true })
      .locator("..")
      .getByRole("button", { name: "Clear", exact: true })
  ).toHaveCount(0)
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await page.getByLabel("Embedded font for Arial").click()
  await expect(page.getByRole("option", { name: "IBM Plex Sans" })).toHaveCount(
    0
  )
})

test("uses one mapping for matching fonts in every presentation and downloads both", async ({
  page,
}) => {
  await page.goto("/")
  await page
    .getByLabel("Drop PowerPoint files here")
    .setInputFiles(presentationPath)
  await page.getByLabel("Replacement for Arial").fill("IBM Plex Sans")
  await page.getByLabel("Add presentations").setInputFiles(presentationPath)
  await expect(page.getByLabel("Replacement for Arial")).toHaveValue(
    "IBM Plex Sans"
  )
  await expect(page.getByText("2 presentations selected")).toBeVisible()
  await expect(page.getByLabel("Replacement for Arial")).toHaveCount(1)
  await expect(
    page.getByRole("row").filter({ hasText: "Arial" })
  ).toContainText("78")
  await expect(
    page.getByRole("row").filter({ hasText: "Arial" })
  ).toContainText("In 2 of 2 files")
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Generate ZIP" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("updated-presentations.zip")
  const zip = await JSZip.loadAsync(await readFile(await download.path()))
  expect(Object.keys(zip.files).sort()).toEqual([
    "generated-sample-fonts-updated-2.pptx",
    "generated-sample-fonts-updated.pptx",
  ])
})
