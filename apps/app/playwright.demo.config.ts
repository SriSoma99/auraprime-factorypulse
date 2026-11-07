// Narrated demo recording (tools/demo). Separate from playwright.config.ts so `pnpm test:e2e` never records video.
import { defineConfig, devices } from "@playwright/test";
import { loadConfig, findRepoRoot } from "@fp/config";

const cfg = loadConfig({ rootDir: findRepoRoot(process.cwd()) });
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.video.ts",
  workers: 1,
  reporter: [["list"]],
  expect: { timeout: 15_000 },
  use: { baseURL: cfg.app.web_dev_url, actionTimeout: 15_000, navigationTimeout: 60_000 },
  projects: [{ name: "demo", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
