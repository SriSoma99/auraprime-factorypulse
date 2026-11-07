import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, findRepoRoot } from "@fp/config";

const rootDir = findRepoRoot(process.cwd());
const cfg = loadConfig({ rootDir });

// The Chrome binary is machine-specific, so it comes from the environment rather than the repo.
const chromePath = process.env.FP_CHROME_PATH;
if (!chromePath) {
  console.error("Set FP_CHROME_PATH to the Chrome or Chromium executable on this machine.");
  process.exit(1);
}
const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-chrome-profile-"));

const outputDir = path.join(rootDir, "screenshots");
const wireframesOut = path.join(outputDir, "wireframes");
const appOut = path.join(outputDir, "app");

fs.mkdirSync(wireframesOut, { recursive: true });
fs.mkdirSync(appOut, { recursive: true });

function capture(url: string, outRelativePath: string, width = 1280, height = 900, virtualTime = 1500) {
  const fullDest = path.join(outputDir, outRelativePath);
  fs.mkdirSync(path.dirname(fullDest), { recursive: true });

  const args = [
    "--headless=new",
    `--user-data-dir=${tempProfileDir}`,
    `--window-size=${width},${height}`,
    `--virtual-time-budget=${virtualTime}`,
    `--screenshot=${fullDest}`,
    url,
  ];

  try {
    execFileSync(chromePath!, args, { stdio: "ignore" });
    if (fs.existsSync(fullDest)) {
      const stats = fs.statSync(fullDest);
      console.log(`[OK] Captured ${outRelativePath} (${stats.size} bytes)`);
      return true;
    } else {
      console.error(`[FAIL] File not found after capture: ${outRelativePath}`);
      return false;
    }
  } catch (err) {
    console.error(`[ERROR] Failed to capture ${outRelativePath}:`, (err as Error).message);
    return false;
  }
}

console.log("=================================================");
console.log("  AuraPrime FactoryPulse v2 - Automated Screen Capture   ");
console.log("=================================================\n");

// 1. Capture Interactive Wireframes (W01 to W13, M01 to M09)
console.log("--- 1. Capturing Interactive Wireframes ---");
const wireframeFiles = fs.readdirSync(path.join(rootDir, "doc", "wireframes"))
  .filter((f) => f.endsWith(".html"));

for (const f of wireframeFiles) {
  const name = f.replace(".html", "");
  const isMobile = name.startsWith("M");
  const width = isMobile ? 390 : 1280;
  const height = isMobile ? 844 : 900;
  const fileUrl = pathToFileURL(path.join(rootDir, "doc", "wireframes", f)).href;
  capture(fileUrl, path.join("wireframes", `${name}.png`), width, height, 1000);
}

// 2. Capture Live Expo Web App Screens
console.log("\n--- 2. Capturing Live Expo Web App Screens ---");
const appBase = cfg.app.web_dev_url;

// Capture unauthenticated sign-in screens
capture(`${appBase}/sign-in`, path.join("app", "01-sign-in.png"), 1280, 900, 2500);
capture(`${appBase}/sign-in`, path.join("app", "01-sign-in-mobile.png"), 390, 844, 2500);

// Capture authenticated screens via Playwright capture suite
console.log("Capturing authenticated views via Playwright e2e/capture.spec.ts...");
try {
  const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  execFileSync(pnpmCmd, ["--filter", "@fp/app", "exec", "playwright", "test", "e2e/capture.spec.ts"], { stdio: "inherit" });
} catch (err) {
  console.warn("[WARN] Playwright capture suite failed or not available in this environment:", (err as Error).message);
}


// 3. Generate Catalog Index
console.log("\n--- 3. Generating Screen Captures Catalog Index ---");
const wireframeImgs = fs.existsSync(wireframesOut) ? fs.readdirSync(wireframesOut).filter(f => f.endsWith(".png")).sort() : [];
const appImgs = fs.existsSync(appOut) ? fs.readdirSync(appOut).filter(f => f.endsWith(".png")).sort() : [];
const e2eOut = path.join(outputDir, "e2e");
const e2eImgs = fs.existsSync(e2eOut) ? fs.readdirSync(e2eOut).filter(f => f.endsWith(".png")).sort() : [];

let catalog = `# Screen Captures Catalog

Automated visual captures of AuraPrime FactoryPulse v2 interactive wireframes, live Expo universal web application, and end-to-end journey verification.

- Generated: ${new Date().toISOString()}
- Total Wireframe Captures: ${wireframeImgs.length}
- Total App Captures: ${appImgs.length}
- Total E2E Journey Captures: ${e2eImgs.length}

---

## 1. Live Universal Web App Screens

Captured from the Expo web application against the mock API on local PostgreSQL synthetic dataset with authenticated operator session.

| Screen | Dimensions | Image Preview |
|---|---|---|
`;

for (const img of appImgs) {
  const isMobile = img.includes("mobile") || img.includes("work-order");
  catalog += `| \`${img}\` | ${isMobile ? "390 x 844 (Mobile)" : "1280 x 900 (Desktop)"} | [${img}](./app/${img}) |\n`;
}

catalog += `\n---

## 2. End-to-End Hero Journey & Verification (Playwright)

Captured during automated Playwright test execution across desktop and mobile viewports.

| Scenario / Step | Viewport | Image Preview |
|---|---|---|
`;

for (const img of e2eImgs) {
  const isPhone = img.includes("phone");
  catalog += `| \`${img}\` | ${isPhone ? "Mobile (Pixel 7)" : "Desktop (1280x900)"} | [${img}](./e2e/${img}) |\n`;
}

catalog += `\n---

## 3. Interactive Wireframes (Approved Design Baseline)

Captured directly from \`doc/wireframes/*.html\` (ADR-027 / ADR-034 baseline).

| Wireframe ID & Name | Type | Image Preview |
|---|---|---|
`;

for (const img of wireframeImgs) {
  const isMobile = img.startsWith("M");
  catalog += `| \`${img}\` | ${isMobile ? "Mobile Companion" : "Desktop Web"} | [${img}](./wireframes/${img}) |\n`;
}

fs.writeFileSync(path.join(outputDir, "README.md"), catalog, "utf-8");
console.log(`[OK] Generated catalog in screenshots/README.md`);
console.log("=================================================");
console.log("All automated screen captures completed!");
console.log("=================================================");

