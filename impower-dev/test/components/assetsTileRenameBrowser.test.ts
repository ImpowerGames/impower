// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

type Size = "portrait" | "landscape" | "small";

const CAST = "Assets/Images/Cast";
const PICTURE = `${CAST}/picture_000.png`;

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  script = await bundlePage("test/components/assetsTileSizesPage.tsx", "test/components/assetsTileSizesWorkspace.ts");
  css = await stylesFor(script);
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (size: Size) => {
  const page = await openPage(browser, script, css, { width: 1440, touch: false });
  await page.evaluate((setup) => window.assetsPage.mount(setup), {
    pictures: 3,
    lists: { assetsFolders: { image: CAST }, assetsLayouts: { [CAST]: size } },
  });
  await page.locator(`[data-asset-path="${PICTURE}"]`).waitFor();
  await frames(page);
  return page;
};

const settle = async (page: Page) => {
  await page.waitForTimeout(250);
  await frames(page);
};

const tile = `[data-tile]:has([data-asset-path="${PICTURE}"])`;
const cell = "[data-probe-cell]";

const measure = (page: Page, tile: string) =>
  page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector);
    const frame = root?.querySelector<HTMLElement>("[data-tile] > :is(button, div)");
    const picture = root?.querySelector<HTMLElement>("img");
    const field = root?.querySelector<HTMLElement>("[data-name-field]")?.parentElement;
    const message = root?.querySelector<HTMLElement>('[role="alert"]')?.parentElement;
    const size = (element?: HTMLElement | null) => {
      if (!element) {
        return null;
      }
      const box = element.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    };
    const tileBox = root?.getBoundingClientRect();
    const messageBox = message?.getBoundingClientRect();
    return {
      frame: size(frame),
      border: frame ? getComputedStyle(frame).borderTopWidth : null,
      picture: size(picture),
      field: size(field)?.width ?? null,
      message: size(message),
      messageClipped: message ? message.scrollHeight > message.clientHeight : null,
      messageInside:
        tileBox && messageBox
          ? messageBox.top >= tileBox.top && messageBox.bottom <= tileBox.bottom && messageBox.left >= tileBox.left && messageBox.right <= tileBox.right
          : null,
    };
  }, tile);

describe("Renaming an asset in a tile keeps the tile's shape (I-2683)", { timeout: 30_000 }, () => {
  it.each(["portrait", "landscape", "small"] as const)("keeps the %s tile's frame and picture, fills the name line and shows the refusal inside the tile", async (size) => {
    const page = await open(size);
    try {
      await page.locator(tile).evaluate((element) => element.parentElement!.setAttribute("data-probe-cell", ""));
      const before = await measure(page, cell);
      await page.locator(`${tile} > span > button`).click();
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await page.locator(`${cell} [data-name-field]`).waitFor({ timeout: 5000 });
      await settle(page);
      const renaming = await measure(page, cell);
      expect(renaming.frame).toEqual(before.frame);
      expect(renaming.border).toBe(before.border);
      expect(renaming.picture).toEqual(before.picture);
      expect(renaming.field).toBeGreaterThanOrEqual(before.frame!.width - 24);
      await page.keyboard.press("End");
      await page.keyboard.type("@x");
      await page.keyboard.press("Enter");
      await page.locator(`${cell} [role="alert"]`).waitFor({ timeout: 5000 });
      await settle(page);
      const refused = await measure(page, cell);
      expect(refused.frame).toEqual(before.frame);
      expect(refused.picture).toEqual(before.picture);
      expect(refused.messageInside).toBe(true);
      expect(refused.messageClipped).toBe(false);
      expect(refused.message!.width).toBeGreaterThanOrEqual(renaming.field! - 4);
    } finally {
      await page.context().close();
    }
  });
});
