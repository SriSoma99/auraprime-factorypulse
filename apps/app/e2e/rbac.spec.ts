// Role-based access in the browser: menus, direct URLs, view-only actions and the W09 Admin module (NFR-S6, ADR-040).
import { test, expect } from "@playwright/test";
import { resetData, signInAs, switchUser } from "./helpers";

test.beforeEach(async ({ request }) => { await resetData(request); });

const desktopTabs: Record<string, string[]> = {
  "u-operator": ["Plant", "Line", "Alerts", "Settings"],
  "u-technician": ["Plant", "Line", "Alerts", "Approvals", "Knowledge", "Field", "Settings"],
  "u-shift-lead": ["Plant", "Line", "Alerts", "Approvals", "Trust", "Knowledge", "Field", "Settings"],
  "u-reliability": ["Plant", "Line", "Alerts", "Approvals", "Trust", "Knowledge", "Learning", "Settings"],
  "u-ops-manager": ["Plant", "Line", "Alerts", "Approvals", "Control Tower", "Compliance", "Learning", "Settings"],
  "u-admin": ["Plant", "Control Tower", "Knowledge", "Compliance", "Developer", "Admin", "Settings"],
};

test("each role sees only the screens the approved matrix gives it", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "sidebar layout");
  for (const [who, tabs] of Object.entries(desktopTabs)) {
    await switchUser(page, who);
    await expect(page.getByRole("tab"), who).toHaveText(tabs);
  }
});

test("a direct URL to a screen the role may not open goes to its first permitted screen", async ({ page }) => {
  await signInAs(page, "u-operator");
  await page.goto("/approvals");
  await expect(page.getByTestId("screen-plant")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await switchUser(page, "u-admin");
  await page.goto("/alerts");
  await expect(page.getByTestId("screen-plant")).toBeVisible();
});

test("view-only access shows the approval but cannot decide it", async ({ page }) => {
  await signInAs(page, "u-technician");
  await page.goto("/approvals/APR-0311");
  await expect(page.getByTestId("view-only")).toContainText("View only for your role");
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByTestId("reject")).toBeDisabled();
});

test("admin assigns a role and changes a role's screen access, and both take effect", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "one admin journey is enough; phone layout is covered by the screen tests");
  await signInAs(page, "u-admin");
  await page.getByRole("tab", { name: "Admin", exact: true }).click();
  await expect(page.getByTestId("screen-admin")).toBeVisible();

  // Guards: own role and API keys cannot change; the admin's own Admin access is locked.
  await expect(page.getByTestId("role-u-admin-operator")).toBeDisabled();
  await expect(page.getByTestId("role-k-integration-admin")).toBeDisabled();
  await page.getByTestId("perm-role-admin").click();
  await expect(page.getByTestId("perm-admin-none")).toBeDisabled();

  // Role assignment
  await page.getByTestId("role-u-operator-technician").click();
  await expect(page.getByTestId("admin-message")).toContainText(/is now technician · audit AUD-\d+/);

  // Screen access: give technicians view access to Trust
  await page.getByTestId("perm-role-technician").click();
  await page.getByTestId("perm-trust-view").click();
  await expect(page.getByTestId("admin-message")).toContainText(/technician · trust is now view · audit AUD-\d+/);
  await expect(page.getByTestId("perm-trust-changed")).toBeVisible();

  await switchUser(page, "u-operator"); // now a technician, with the Trust override
  await expect(page.getByRole("tab")).toHaveText(["Plant", "Line", "Alerts", "Approvals", "Trust", "Knowledge", "Field", "Settings"]);
  await page.getByRole("tab", { name: "Trust", exact: true }).click();
  await expect(page.getByTestId("screen-trust")).toBeVisible();

  // Reset to default removes it again
  await switchUser(page, "u-admin");
  await page.goto("/admin");
  await page.getByTestId("perm-role-technician").click();
  await page.getByTestId("perm-trust-reset").click();
  await expect(page.getByTestId("perm-trust-changed")).toHaveCount(0);
  await switchUser(page, "u-operator");
  await expect(page.getByRole("tab", { name: "Trust", exact: true })).toHaveCount(0);
});

test("a role without admin access never sees the Admin module", async ({ page }) => {
  await signInAs(page, "u-shift-lead");
  await page.goto("/admin");
  await expect(page.getByTestId("screen-plant")).toBeVisible();
  await expect(page.getByTestId("screen-admin")).toHaveCount(0);
});
