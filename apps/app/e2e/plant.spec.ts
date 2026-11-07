// W14 Plant equipment: registry, limits, live health and machine state on the first screen (ING-7, ING-12; UI-6 symbols plus labels).
import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiUrl, resetData, signInAs } from "./helpers";

test.beforeEach(async ({ request }) => { await resetData(request); });

async function inject(request: APIRequestContext, sensorId: string, values: number[], ageSeconds = 0) {
  expect((await request.post(`${apiUrl}/mock/telemetry`, { data: { sensorId, values, ageSeconds } })).status()).toBe(204);
}

test("the first screen maps every line, station, machine and sensor with its limits", async ({ page }) => {
  await signInAs(page, "u-shift-lead");
  await expect(page.getByTestId("screen-plant")).toBeVisible();
  await expect(page.getByTestId("line-LINE-01")).toContainText("Demo Plant · Demo machining line");
  await expect(page.getByTestId("line-line-body-1")).toContainText("Plant A · Body line 1");
  await expect(page.locator('[data-testid^="plant-station-"]')).toHaveCount(10);
  await expect(page.getByTestId("plant-station-ST-04")).toContainText("bottleneck");
  await expect(page.getByTestId("machine-M-05")).toContainText("MC-05");
  await expect(page.getByTestId("sensor-S-05-SPD")).toContainText("normal 5500–6500 rpm");
  await expect(page.getByTestId("no-telemetry")).toBeVisible();
  await expect(page.getByTestId("count-no_data")).toContainText("39 no data");
  await expect(page.getByTestId("state-M-05")).toContainText("State unknown");

  await page.getByTestId("line-line-body-1").click();
  await expect(page.locator('[data-testid^="plant-station-"]')).toHaveCount(6);
  await expect(page.getByTestId("sensor-FT-401")).toContainText("normal 20–28 L/min");
  await expect(page.getByText("Acme")).toHaveCount(0); // another tenant's equipment never appears (invariant 4)
});

test("live readings show OK, out of range, flatline, stale and machine state, and the filter keeps the faults", async ({ page, request }) => {
  await signInAs(page, "u-shift-lead");
  await expect(page.getByTestId("screen-plant")).toBeVisible();
  await inject(request, "S-01-SPD", [5890, 5901, 5896, 5905, 5899, 5902, 5893, 5900, 5904, 5897]);
  await inject(request, "S-05-SPD", [4.2, 4.2]);
  await inject(request, "S-03-VIB", Array(10).fill(2.168));
  await inject(request, "S-07-TMP", [50.7], 60);
  await page.reload();

  await expect(page.getByTestId("status-S-01-SPD")).toHaveText("● OK");
  await expect(page.getByTestId("value-S-01-SPD")).toHaveText("5897 rpm");
  await expect(page.getByTestId("state-M-01")).toContainText("▶ Running");
  await expect(page.getByTestId("status-S-05-SPD")).toHaveText("▲ Out of range (low)");
  await expect(page.getByTestId("state-M-05")).toContainText("■ Stopped");
  await expect(page.getByTestId("status-S-03-VIB")).toHaveText("▬ Flatline");
  await expect(page.getByTestId("status-S-07-TMP")).toHaveText("◌ Stale");
  await expect(page.getByTestId("sensor-S-07-TMP")).toContainText(/silent \d+ s \(limit 10 s\)/);
  await expect(page.getByTestId("no-telemetry")).toHaveCount(0);
  await expect(page.getByTestId("count-out_of_range")).toContainText("1 out of range");

  const shotName = `plant-${test.info().project.name}.png`;
  await page.screenshot({ path: `test-results/${shotName}`, fullPage: true });
  try { await page.screenshot({ path: `../../screenshots/e2e/${shotName}`, fullPage: true }); } catch {}

  await page.getByTestId("attention-only").click();
  await expect(page.getByTestId("sensor-S-01-SPD")).toHaveCount(0);
  await expect(page.getByTestId("sensor-S-05-SPD")).toBeVisible();
  await expect(page.getByTestId("sensor-S-07-TMP")).toBeVisible();
  await expect(page.locator('[data-testid^="plant-station-"]')).toHaveCount(10);
});

test("phone keeps five main tabs plus More, and More reaches the other screens (02 section 4.2)", async ({ page }) => {
  await signInAs(page, "u-shift-lead");
  await expect(page.getByTestId("screen-plant")).toBeVisible();
  const tabs = page.getByRole("tab");
  if (test.info().project.name === "phone") {
    await expect(tabs).toHaveText(["Plant", "Line", "Alerts", "Approvals", "Field", "More"]);
    await page.getByRole("tab", { name: "More" }).click();
    await expect(page.getByTestId("screen-more")).toBeVisible();
    await expect(page.getByTestId("more-trust")).toBeVisible();
    await expect(page.getByTestId("more-admin")).toHaveCount(0);
    await page.getByTestId("more-knowledge").click();
    await expect(page).toHaveURL(/\/knowledge$/);
  } else {
    await expect(tabs).toHaveText(["Plant", "Line", "Alerts", "Approvals", "Trust", "Knowledge", "Field", "Settings"]);
  }
});
