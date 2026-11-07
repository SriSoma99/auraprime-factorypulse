// Hero journey end to end on synthetic data (01 hero scenario; UI-AC-1, 3, 4, 5, 7, 10).
import { test, expect } from "@playwright/test";
import { apiUrl, openScreen, resetData, signInAs } from "./helpers";

test.beforeEach(async ({ request }) => { await resetData(request); });

test("alert → cited abstention → tier-1 approval → technician checklist → verifying", async ({ page, browser }) => {
  const shot = async (n: string) => {
    const fn = `hero-${n}-${test.info().project.name}.png`;
    await page.screenshot({ path: `test-results/${fn}`, fullPage: true });
    try { await page.screenshot({ path: `../../screenshots/e2e/${fn}`, fullPage: true }); } catch {}
  };
  await signInAs(page, "u-shift-lead");
  await expect(page.getByTestId("screen-plant")).toBeVisible();
  await page.getByRole("tab", { name: "Line", exact: true }).click();
  await expect(page.getByTestId("screen-line")).toBeVisible();
  await shot("1-line");

  await page.getByRole("tab", { name: "Alerts" }).click();
  await page.getByTestId("group-GRP-01").click();
  await expect(page.getByTestId("screen-incident")).toBeVisible();
  await expect(page.getByTestId("summary-kind")).toContainText("AI-generated");
  await expect(page.getByTestId("abstention")).toContainText("Insufficient evidence");
  await expect(page.getByText("[1] Weld Transformer Manual v3")).toBeVisible();
  await shot("2-incident");

  await page.getByTestId("open-approval").click();
  await expect(page.getByTestId("approval-tier")).toContainText("1 · shift lead");
  await expect(page.getByTestId("reject")).toBeDisabled();
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("decision-result")).toContainText("Approved by Sam Rivera");
  await expect(page.getByTestId("decision-result")).toContainText(/AUD-\d{4}/);
  await shot("3-approved");

  const tech = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
  await signInAs(tech, "u-technician");
  await tech.goto("/work-orders/WO-0311");
  const save = tech.getByTestId("save-step");
  await save.click();                                   // 1 confirm asset
  await expect(tech.getByTestId("progress-text")).toHaveText("1 of 5 steps done");
  await save.click();                                   // 2 safety reminder
  await expect(tech.getByTestId("progress-text")).toHaveText("2 of 5 steps done");
  await tech.getByTestId("reading-input").fill("184");  // 3 reading: out of instrument range
  await expect(tech.getByTestId("reading-problem")).toContainText("outside what this instrument can read");
  await expect(save).toBeDisabled();
  await tech.getByTestId("reading-input").fill("18.4");
  await save.click();
  await expect(tech.getByTestId("progress-text")).toHaveText("3 of 5 steps done");
  await save.click();                                   // 4 inspection
  await tech.getByTestId("choice-Strainer partly blocked").click();
  await save.click();                                   // 5 finding
  await expect(tech.getByTestId("outcome-submitted")).toBeVisible();
  const checkFn = `hero-4-checklist-${test.info().project.name}.png`;
  await tech.screenshot({ path: `test-results/${checkFn}`, fullPage: true });
  try { await tech.screenshot({ path: `../../screenshots/e2e/${checkFn}`, fullPage: true }); } catch {}

  await page.goto("/incidents/INC-0042");
  await expect(page.getByText("Technician finding: Strainer partly blocked")).toBeVisible();
});

test("an API key can view but never approve (invariant 2, UI-AC-5)", async ({ page }) => {
  await signInAs(page, "k-integration");
  await page.goto("/approvals/APR-0311");
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByText("API keys and agent tokens cannot approve")).toBeVisible();
});

test("at L3 a shift lead cannot decide; the tier is raised (03 section 13.2)", async ({ page, request }) => {
  await request.put(`${apiUrl}/mock/state`, { data: { fallbackLevel: "L3" } });
  await signInAs(page, "u-shift-lead");
  await page.goto("/approvals/APR-0311");
  await expect(page.getByTestId("approval-tier")).toContainText("2 · reliability engineer");
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByTestId("fallback-banner")).toContainText("higher approval tier");
});

test("at L2 the incident uses a template summary", async ({ page, request }) => {
  await request.put(`${apiUrl}/mock/state`, { data: { fallbackLevel: "L2" } });
  await signInAs(page, "u-shift-lead");
  await page.goto("/incidents/INC-0042");
  await expect(page.getByTestId("summary-kind")).toContainText("Template summary");
});

test("telemetry trust shows the sensor-fault verdict for PT-310 (TRU-3)", async ({ page }) => {
  await signInAs(page, "u-reliability");
  await openScreen(page, test.info().project.name === "phone", "Trust", "trust");
  await page.getByTestId("sensor-PT-310").click();
  await expect(page.getByTestId("trust-verdict")).toContainText("sensor or data fault");
  const trustFn = `trust-${test.info().project.name}.png`;
  await page.screenshot({ path: `test-results/${trustFn}`, fullPage: true });
  try { await page.screenshot({ path: `../../screenshots/e2e/${trustFn}`, fullPage: true }); } catch {}
});
