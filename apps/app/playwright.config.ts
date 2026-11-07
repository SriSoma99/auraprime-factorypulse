// End-to-end tests on the web build against the mock API (ADR-030 item 5). Targets come from config, not literals.
import { defineConfig, devices } from "@playwright/test";
import { loadConfig, findRepoRoot } from "@fp/config";

const cfg = loadConfig({ rootDir: findRepoRoot(process.cwd()) });
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/warmup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: cfg.app.web_dev_url, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
