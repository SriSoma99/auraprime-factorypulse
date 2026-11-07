import { expect, type Page, type APIRequestContext } from "@playwright/test";
import { loadConfig, findRepoRoot } from "@fp/config";

const cfg = loadConfig({ rootDir: findRepoRoot(process.cwd()) });
export const apiUrl = cfg.app.api_base_url;

export async function resetData(request: APIRequestContext, level = "L0") {
  expect((await request.post(`${apiUrl}/mock/reset`)).status()).toBe(204);
  await request.put(`${apiUrl}/mock/state`, { data: { fallbackLevel: level } });
}
export async function signInAs(page: Page, principalId: string) {
  await page.goto("/sign-in");
  await page.getByTestId(`principal-${principalId}`).click();
  await expect(page.getByTestId("level-chip")).toBeVisible();
}
/** Opens a secondary screen the way a user would: the sidebar tab on desktop, More on a phone (02 section 4.2). */
export async function openScreen(page: Page, isPhone: boolean, tab: string, slug: string) {
  if (isPhone) {
    await page.getByRole("tab", { name: "More" }).click();
    await page.getByTestId(`more-${slug}`).click();
  } else {
    await page.getByRole("tab", { name: tab, exact: true }).click();
  }
}
/** Switches to another user on the same page: drop the stored session token (src/lib/token-store.web.ts), then sign in fresh. */
export async function switchUser(page: Page, principalId: string) {
  if (page.url().startsWith("http")) await page.evaluate(() => sessionStorage.clear());
  await page.goto("/sign-in");
  await page.reload();
  await signInAs(page, principalId);
}
