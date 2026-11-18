// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage } from "./pageBundle";

let browser: Browser;
let script: string;

beforeAll(async () => {
  script = await bundlePage("test/components/savedScrollPersistencePage.tsx", "test/components/savedScrollPersistenceWorkspace.ts");
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const mounted = async (page: Page) => {
  await page.evaluate(() => window.persistencePage.mount());
  await frames(page);
};

const scrolled = async (page: Page, top: number) => {
  await page.evaluate((to) => window.persistencePage.scrollTo(to), top);
  await frames(page);
};

describe("a list's saved scroll position reaches the browser's storage when the page is left, in Chromium (I-2545)", () => {
  it.each([0, 100])("has the latest position in storage when the page hides %i ms after the scroll", async (elapsed) => {
    const page = await openPage(browser, script, "", { width: 1440 });
    try {
      await mounted(page);
      expect(await page.evaluate(() => window.persistencePage.stored())).toBe(1000);
      expect(await page.evaluate(() => window.persistencePage.scrollTop())).toBe(1000);
      await scrolled(page, 6400);
      await page.waitForTimeout(elapsed);
      const stored = await page.evaluate(() => {
        window.dispatchEvent(new Event("pagehide"));
        return window.persistencePage.stored();
      });
      expect(stored).toBe(6400);
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it("reopens at the latest position after a reload 100 ms after the scroll, already stored when the page hid", async () => {
    const page = await openPage(browser, script, "", { width: 1440 });
    try {
      await mounted(page);
      await scrolled(page, 6400);
      await page.evaluate(() => window.persistencePage.recordStoredAtPageHide());
      await page.waitForTimeout(100);
      await page.reload();
      await page.addScriptTag({ content: script });
      await mounted(page);
      expect(await page.evaluate(() => window.persistencePage.storedAtPageHide())).toBe("6400");
      expect(await page.evaluate(() => window.persistencePage.scrollTop())).toBe(6400);
    } finally {
      await page.context().close();
    }
  }, 60_000);
});
