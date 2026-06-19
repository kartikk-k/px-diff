import { chromium } from "playwright";

/**
 * Capture a full-page screenshot of a URL using headless Chromium.
 * Returns the raw PNG buffer.
 */
export async function screenshotPage(
  url: string,
  viewport: { width: number; height: number },
): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "networkidle" });
    const buffer = await page.screenshot({ fullPage: true });
    return buffer as Buffer;
  } finally {
    await browser.close();
  }
}
