// Narrated hero demo recording (01 hero scenario). Run with playwright.demo.config.ts after tools/demo/narrate.ts.
// Each scene runs its actions, then holds until its narration ends; scene start times go to timeline.json for audio placement.
import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { findRepoRoot } from "@fp/config";
import { apiUrl, resetData } from "./helpers";

const rootDir = findRepoRoot(process.cwd());
const narration = JSON.parse(fs.readFileSync(path.join(rootDir, "tools/demo/narration.json"), "utf8"));
const outDir = path.join(rootDir, narration.outDir);
const durations: Record<string, number> = JSON.parse(fs.readFileSync(path.join(outDir, "durations.json"), "utf8"));

async function highlight(target: Locator) {
  await target.evaluate(el => {
    el.scrollIntoView({ block: "center" });
    (el as HTMLElement).style.outline = "3px solid #d97706";
    (el as HTMLElement).style.outlineOffset = "4px";
    (el as HTMLElement).style.borderRadius = "8px";
  });
}

async function signIn(page: Page, principalId: string) {
  // One page keeps one continuous video, so switch users by signing out rather than opening a new page.
  const signOut = page.getByRole("button", { name: "Sign out" });
  if (await signOut.isVisible()) await signOut.click();
  else await page.goto("/sign-in");
  await page.getByTestId(`principal-${principalId}`).click();
  await expect(page.getByTestId("level-chip")).toBeVisible();
}

// Live readings through the local mock control (ADR-030), the same values the W14 Playwright test uses.
async function seedReadings(request: APIRequestContext) {
  for (const [sensorId, values, ageSeconds] of [["S-01-SPD", [5890, 5901, 5896, 5905, 5899, 5902, 5893, 5900, 5904, 5897], 0], ["S-05-SPD", [4.2, 4.2], 0],
    ["S-03-VIB", Array(10).fill(2.168), 0], ["S-07-TMP", [50.7], 60]] as const) {
    expect((await request.post(`${apiUrl}/mock/telemetry`, { data: { sensorId, values, ageSeconds } })).status()).toBe(204);
  }
}

test("narrated hero demo", async ({ browser, request }) => {
  test.setTimeout(10 * 60_000);
  await resetData(request);
  const size = test.info().project.use.viewport ?? { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: path.join(outDir, "video"), size } });
  const page = await context.newPage();
  const t0 = Date.now();
  const timeline: { id: string; startMs: number }[] = [];

  async function scene(id: string, actions: () => Promise<void>) {
    if (!(id in durations)) throw new Error(`scene ${id} has no narration`);
    const start = Date.now();
    timeline.push({ id, startMs: start - t0 });
    await actions();
    const remaining = durations[id]! + narration.gapMs - (Date.now() - start);
    if (remaining > 0) await page.waitForTimeout(remaining);
  }

  await page.goto("/sign-in");
  await expect(page.getByTestId("principal-u-shift-lead")).toBeVisible();
  await page.waitForTimeout(narration.leadInMs);

  await scene("intro", async () => {});
  // Sign in between scenes so the plant narration starts on a loaded screen, not on the spinner.
  await seedReadings(request);
  await page.getByTestId("principal-u-shift-lead").click();
  await expect(page.getByTestId("screen-plant")).toBeVisible();
  await expect(page.getByTestId("status-S-05-SPD")).toContainText("Out of range");
  await scene("plant", async () => {
    await highlight(page.getByTestId("sensor-S-05-SPD"));
    await page.waitForTimeout(2500);
    await highlight(page.getByTestId("sensor-S-03-VIB"));
    await page.waitForTimeout(2500);
    await highlight(page.getByTestId("sensor-S-07-TMP"));
  });
  await scene("line", async () => {
    await page.getByRole("tab", { name: "Line", exact: true }).click();
    await expect(page.getByTestId("screen-line")).toBeVisible();
  });
  await scene("incident", async () => {
    await page.getByRole("tab", { name: "Alerts" }).click();
    await page.getByTestId("group-GRP-01").click();
    await expect(page.getByTestId("screen-incident")).toBeVisible();
  });
  await scene("hypotheses", async () => {
    await highlight(page.getByTestId("incident-hypotheses"));
    await page.waitForTimeout(Math.round(durations.hypotheses! / 2));
    await highlight(page.getByTestId("incident-evidence"));
  });
  await scene("abstain", async () => {
    await highlight(page.getByTestId("abstention"));
  });
  await scene("approval", async () => {
    await page.getByTestId("open-approval").click();
    await expect(page.getByTestId("approval-tier")).toContainText("1 · shift lead");
  });
  await scene("approved", async () => {
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("decision-result")).toContainText(/AUD-\d{4}/);
    await highlight(page.getByTestId("decision-result"));
  });
  await scene("checklist", async () => {
    await signIn(page, "u-technician");
    await page.goto("/work-orders/WO-0311");
    const save = page.getByTestId("save-step");
    await save.click();
    await expect(page.getByTestId("progress-text")).toHaveText("1 of 5 steps done");
    await save.click();
    await expect(page.getByTestId("progress-text")).toHaveText("2 of 5 steps done");
    await page.getByTestId("reading-input").pressSequentially("184", { delay: 150 });
    await expect(page.getByTestId("reading-problem")).toBeVisible();
    await highlight(page.getByTestId("reading-problem"));
  });
  await scene("finding", async () => {
    const save = page.getByTestId("save-step");
    await page.getByTestId("reading-input").fill("");
    await page.getByTestId("reading-input").pressSequentially("18.4", { delay: 150 });
    await save.click();
    await expect(page.getByTestId("progress-text")).toHaveText("3 of 5 steps done");
    await save.click();
    await page.getByTestId("choice-Strainer partly blocked").click();
    await save.click();
    await expect(page.getByTestId("outcome-submitted")).toBeVisible();
    await highlight(page.getByTestId("outcome-submitted"));
  });
  await scene("trust", async () => {
    await signIn(page, "u-reliability");
    await page.getByRole("tab", { name: "Trust" }).click();
    await page.getByTestId("sensor-PT-310").click();
    await expect(page.getByTestId("trust-verdict")).toContainText("sensor or data fault");
    await highlight(page.getByTestId("trust-verdict"));
  });
  await scene("documents", async () => {
    // The refusal and the acceptance land on their own sentences: fractions of the narration, from its sentence pauses.
    const start = Date.now();
    const holdUntil = async (fraction: number) => {
      const remaining = durations.documents! * fraction - (Date.now() - start);
      if (remaining > 0) await page.waitForTimeout(remaining);
    };
    await signIn(page, "u-acme-lead");
    await page.goto("/knowledge");
    await page.getByTestId("upload-toggle").click();
    await page.getByTestId("doctype-sop").click();
    await page.getByTestId("asset-as-x-press").click();
    await page.getByTestId("upload-title").pressSequentially("sss", { delay: 150 });
    await page.getByTestId("upload-content").pressSequentially("ss", { delay: 150 });
    await holdUntil(0.3);
    await page.getByTestId("upload-submit").click();
    await expect(page.getByTestId("upload-message")).toContainText("Fix these");
    await highlight(page.getByTestId("upload-content"));
    await holdUntil(0.6);
    await page.getByTestId("sample-1").click();
    await page.getByTestId("upload-submit").click();
    await expect(page.getByTestId("upload-message")).toContainText("waits for another person");
    await highlight(page.locator('[data-testid^="doc-DOC-"]').first());
  });
  await scene("apikey", async () => {
    await resetData(request); // APR-0311 was approved above; show it undecided again
    await seedReadings(request); // the reset clears live readings, and the closing scenes show the plant
    await signIn(page, "k-integration");
    await page.goto("/approvals/APR-0311");
    await expect(page.getByTestId("approve")).toBeDisabled();
    await highlight(page.getByText("API keys and agent tokens cannot approve"));
  });
  await scene("roles", async () => {
    await signIn(page, "u-operator");
    await expect(page.getByTestId("screen-plant")).toBeVisible();
    await highlight(page.getByRole("tablist"));
  });
  await scene("outro", async () => {
    await signIn(page, "u-shift-lead");
    await expect(page.getByTestId("screen-plant")).toBeVisible();
  });

  const video = page.video();
  await context.close();
  const raw = path.join(outDir, "raw.webm");
  await video!.saveAs(raw);
  fs.writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify({ video: raw, totalMs: Date.now() - t0, scenes: timeline }, null, 2) + "\n");
});
