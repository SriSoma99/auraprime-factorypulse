import { test } from "@playwright/test";
import { resetData, signInAs, switchUser } from "./helpers";

test.beforeEach(async ({ request }) => { await resetData(request); });

// Each screen is captured as a role that may open it (ADR-040).
const desktopScreens = [
  { path: "/", name: "01-plant-equipment", as: "u-shift-lead" },
  { path: "/line", name: "02-line-overview", as: "u-shift-lead" },
  { path: "/alerts", name: "03-alert-queue", as: "u-shift-lead" },
  { path: "/incidents/INC-0042", name: "04-incident-detail-INC-0042", as: "u-shift-lead" },
  { path: "/approvals", name: "05-approvals-queue", as: "u-shift-lead" },
  { path: "/approvals/APR-0311", name: "05-approval-detail-APR-0311", as: "u-shift-lead" },
  { path: "/trust", name: "07-telemetry-trust", as: "u-reliability" },
  { path: "/knowledge", name: "08-knowledge-base", as: "u-reliability" },
  { path: "/compliance", name: "09-compliance-audit-chain", as: "u-admin" },
  { path: "/control-tower", name: "10-control-tower", as: "u-admin" },
  { path: "/developer", name: "11-developer-api-mcp", as: "u-admin" },
  { path: "/learning", name: "12-learning-case-memory", as: "u-reliability" },
  { path: "/settings", name: "13-settings-profile", as: "u-shift-lead" },
  { path: "/admin", name: "14-admin-users-access", as: "u-admin" },
];

test("capture authenticated desktop screens", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "desktop") return;

  let current = "";
  for (const s of desktopScreens) {
    if (s.as !== current) { await switchUser(page, s.as); current = s.as; }
    await page.goto(s.path);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `../../screenshots/app/${s.name}.png`, fullPage: true });
  }
});

test("capture authenticated mobile work order", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "phone") return;

  await signInAs(page, "u-technician");
  await page.goto("/work-orders/WO-0311");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `../../screenshots/app/06-work-order-checklist.png`, fullPage: true });
});
