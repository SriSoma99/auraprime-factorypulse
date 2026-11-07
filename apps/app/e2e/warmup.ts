// Global setup: load the sign-in page once so Metro compiles the web bundle before the first test's timeout starts.
// A cold bundle on /mnt/c can take over a minute (TO-10), which used to fail whichever test happened to run first.
import { chromium, type FullConfig } from "@playwright/test";

export default async function warmup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/sign-in`, { timeout: 300_000 });
    await page.waitForSelector('[data-testid^="principal-"]', { timeout: 300_000 });
  } finally {
    await browser.close();
  }
}
