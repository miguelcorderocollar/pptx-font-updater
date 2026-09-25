import { defineConfig, devices } from "@playwright/test"

const localURL = "http://127.0.0.1:4179"
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localURL

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --host 127.0.0.1 --port 4179 --strictPort",
        url: localURL,
        reuseExistingServer: false,
        timeout: 30_000,
      },
})
