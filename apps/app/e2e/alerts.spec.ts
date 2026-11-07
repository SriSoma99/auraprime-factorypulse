import { test, expect } from "@playwright/test";
import { resetData, signInAs } from "./helpers";

test.beforeEach(async ({ request }) => { await resetData(request); });

test("shift lead sees the hero alert group first, ranked by impact (UI-AC-2)", async ({ page }) => {
  await signInAs(page, "u-shift-lead");
  await page.getByRole("tab", { name: "Alerts" }).click();
  await expect(page.getByTestId("screen-alerts")).toBeVisible();
  await expect(page.getByText("7 alerts · 5 likely causes")).toBeVisible();
  const first = page.locator('[data-testid^="group-"], [data-testid^="alert-"]').first();
  await expect(first).toHaveAttribute("data-testid", "group-GRP-01");
  await expect(page.getByText("Acme press pressure")).toHaveCount(0);
  const alertsFn = `alerts-${test.info().project.name}.png`;
  await page.screenshot({ path: `test-results/${alertsFn}`, fullPage: true });
  try { await page.screenshot({ path: `../../screenshots/e2e/${alertsFn}`, fullPage: true }); } catch {}
});

test("fallback banner follows the level (UI-AC-6)", async ({ page, request }) => {
  await signInAs(page, "u-shift-lead");
  await request.put(`${(await import("./helpers")).apiUrl}/mock/state`, { data: { fallbackLevel: "L4" } });
  await page.reload();
  await expect(page.getByTestId("fallback-banner")).toContainText("Basic detection only");
  await expect(page.getByTestId("level-chip")).toContainText("L4");
});
