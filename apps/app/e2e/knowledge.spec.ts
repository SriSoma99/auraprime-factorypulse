// W07 document lifecycle in the browser (RAG-10, RAG-12, RAG-13; ADR-041): junk is refused with reasons, a sample
// written to the template is accepted and waits for a second person, and documents can be deleted or withdrawn.
import { test, expect } from "@playwright/test";
import { resetData, signInAs, switchUser } from "./helpers";

test.beforeEach(async ({ request }) => { await resetData(request); });

test("meaningless text is refused with the reasons next to each field", async ({ page }) => {
  await signInAs(page, "u-acme-lead");
  await page.goto("/knowledge");
  await page.getByTestId("upload-toggle").click();
  await page.getByTestId("doctype-sop").click();
  await page.getByTestId("asset-as-x-press").click();
  await page.getByTestId("upload-title").fill("sss");
  await page.getByTestId("upload-version").fill("v1");
  await page.getByTestId("upload-effective").fill("2026-01-01");
  await page.getByTestId("upload-content").fill("ss");
  await page.getByTestId("upload-submit").click();
  await expect(page.getByTestId("upload-message")).toContainText("Fix these");
  await expect(page.getByTestId("problem-upload-title").first()).toContainText("at least 8 characters");
  await expect(page.getByTestId("problem-upload-content").first()).toContainText("words");
  await expect(page.getByTestId("problem-upload-content").filter({ hasText: "## Safety" })).toBeVisible();
  await expect(page.getByTestId("filter-all")).toContainText("(0)");
});

test("insert template fills the required headings", async ({ page }) => {
  await signInAs(page, "u-acme-lead");
  await page.goto("/knowledge");
  await page.getByTestId("upload-toggle").click();
  await page.getByTestId("doctype-troubleshooting_guide").click();
  await page.getByTestId("insert-template").click();
  await expect(page.getByTestId("upload-content")).toHaveValue(/## Symptom[\s\S]*## Corrective action/);
});

test("a sample is accepted, waits for a second person, then is approved", async ({ page }) => {
  await signInAs(page, "u-acme-lead");
  await page.goto("/knowledge");
  await page.getByTestId("upload-toggle").click();
  await page.getByTestId("sample-1").click();
  await page.getByTestId("upload-submit").click();
  await expect(page.getByTestId("upload-message")).toContainText("waits for another person");
  const row = page.locator('[data-testid^="doc-DOC-"]').first();
  await expect(row).toContainText("Pending review");
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();
  await expect(row).toContainText("another person must approve it");

  await switchUser(page, "u-acme-reliability");
  await page.goto("/knowledge");
  const same = page.locator('[data-testid^="doc-DOC-"]').first();
  await same.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("doc-message")).toContainText("approved");
  await expect(same).toContainText("Approved");
  await expect(same).toContainText("approved by Acme reliability engineer");
});

test("a junk upload nobody cited is deleted; a cited document is withdrawn", async ({ page }) => {
  await signInAs(page, "u-acme-lead");
  await page.goto("/knowledge");
  await page.getByTestId("upload-toggle").click();
  await page.getByTestId("sample-0").click();
  await page.getByTestId("upload-submit").click();
  await expect(page.getByTestId("upload-message")).toContainText("indexed");
  const row = page.locator('[data-testid^="doc-DOC-"]').first();
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("remove-confirm")).toBeDisabled();
  await page.getByTestId("remove-reason").fill("uploaded by mistake");
  await page.getByTestId("remove-confirm").click();
  await expect(page.getByTestId("doc-message")).toContainText("deleted");
  await expect(page.locator('[data-testid^="doc-DOC-"]')).toHaveCount(0);

  await switchUser(page, "u-reliability");
  await page.goto("/knowledge");
  const cited = page.getByTestId("doc-CIT-1");
  await expect(cited).toContainText("Cited");
  await cited.getByRole("button", { name: "Withdraw" }).click();
  await page.getByTestId("remove-reason").fill("superseded by manual v4");
  await page.getByTestId("remove-confirm").click();
  await expect(page.getByTestId("doc-message")).toContainText("withdrawn");
  await expect(cited).toContainText("Withdrawn: superseded by manual v4");
});

test("samples are offered only for the tenant's own equipment", async ({ page }) => {
  await signInAs(page, "u-technician");
  await page.goto("/knowledge");
  await page.getByTestId("upload-toggle").click();
  await expect(page.getByTestId("samples-none")).toContainText("Acme shift lead");
});

test("a role without knowledge access is sent to its first screen", async ({ page }) => {
  await signInAs(page, "u-ops-manager");
  await page.goto("/knowledge");
  // Operations managers have no knowledge access at all; the route sends them to their first screen.
  await expect(page.getByTestId("screen-plant")).toBeVisible();
});
