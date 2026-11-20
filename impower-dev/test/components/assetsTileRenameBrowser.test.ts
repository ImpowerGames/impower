// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

type Size = "portrait" | "landscape" | "small";
type Display = { width: number; height: number; touch: boolean };

const CAST = "Assets/Images/Cast";
const PICTURE = `${CAST}/picture_000.png`;
const FOLDER = `${CAST}/Crew`;

const DESKTOP: Display = { width: 1440, height: 900, touch: false };
const PHONE: Display = { width: 430, height: 932, touch: true };
const TABLET: Display = { width: 768, height: 1024, touch: true };

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

const open = async (size: Size, display: Display) => {
  const page = await openPage(browser, script, css, display);
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

const tileOf = (path: string) => `[data-tile]:has([data-asset-path="${path}"])`;
const cell = "[data-probe-cell]";

const measure = (page: Page, tile: string) =>
  page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector);
    const frame = root?.querySelector<HTMLElement>("[data-tile] > :is(button, div)");
    const picture = root?.querySelector<HTMLElement>("[data-tile] > :is(button, div) > .order-first");
    const field = root?.querySelector<HTMLElement>("[data-name-field]")?.parentElement;
    const message = root?.querySelector<HTMLElement>('[role="alert"]')?.parentElement;
    const size = (element?: HTMLElement | null) => {
      if (!element) {
        return null;
      }
      const box = element.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    };
    const frameBox = frame?.getBoundingClientRect();
    const fieldBox = field?.getBoundingClientRect();
    const messageBox = message?.getBoundingClientRect();
    const shows = (x: number, y: number) => !!message && message.contains(document.elementFromPoint(x, y));
    return {
      frame: size(frame),
      border: frame ? getComputedStyle(frame).borderTopWidth : null,
      picture: size(picture),
      field: size(field),
      fieldInFrame:
        frameBox && fieldBox
          ? fieldBox.top >= frameBox.top && fieldBox.bottom <= frameBox.bottom && fieldBox.left >= frameBox.left && fieldBox.right <= frameBox.right
          : null,
      message: size(message),
      messageClipped: message ? message.scrollHeight > message.clientHeight + 1 : null,
      messageInside:
        frameBox && messageBox
          ? messageBox.top >= frameBox.top && messageBox.bottom <= frameBox.bottom && messageBox.left >= frameBox.left && messageBox.right <= frameBox.right
          : null,
      messageOverTile:
        frameBox && messageBox && fieldBox
          ? (messageBox.bottom <= fieldBox.top || messageBox.top >= frameBox.bottom) && messageBox.left >= frameBox.left && messageBox.right <= frameBox.right
          : null,
      messageShown: messageBox
        ? shows(messageBox.left + 6, messageBox.top + 6) && shows(messageBox.right - 6, messageBox.bottom - 6)
        : null,
    };
  }, tile);

const rename = (page: Page) =>
  page
    .getByRole("menuitem", { name: "Rename" })
    .or(page.getByRole("button", { name: "Rename", exact: true }))
    .first();

const CASES = [DESKTOP, PHONE, TABLET].flatMap((display) =>
  (["portrait", "landscape", "small"] as const).flatMap((size) => [PICTURE, FOLDER].map((path) => ({ display, size, path, label: `${display.width}${display.touch ? " touch" : ""}` }))),
);

describe("Renaming an asset in a tile keeps the tile's shape (I-2683)", { timeout: 30_000 }, () => {
  it.each(CASES)("keeps the $size tile's frame and picture for $path at $label, fills the name line and shows the whole refusal", async ({ display, size, path }) => {
    const page = await open(size, display);
    const tile = tileOf(path);
    try {
      await page.locator(tile).evaluate((element) => element.parentElement!.setAttribute("data-probe-cell", ""));
      const before = await measure(page, cell);
      await page.locator(`${tile} > span > button`).click();
      await settle(page);
      await rename(page).click();
      await page.locator(`${cell} [data-name-field]`).waitFor({ timeout: 5000 });
      await settle(page);
      const renaming = await measure(page, cell);
      expect(renaming.frame).toEqual(before.frame);
      expect(renaming.border).toBe(before.border);
      expect(renaming.picture).toEqual(before.picture);
      expect(renaming.field!.width).toBeGreaterThanOrEqual(before.frame!.width - 24);
      expect(renaming.field!.height).toBe(display.touch ? 44 : 26);
      expect(renaming.fieldInFrame).toBe(true);
      await page.keyboard.press("End");
      await page.keyboard.type("@x");
      await page.keyboard.press("Enter");
      await page.locator(`${cell} [role="alert"]`).waitFor({ timeout: 5000 });
      await settle(page);
      const refused = await measure(page, cell);
      expect(refused.frame).toEqual(before.frame);
      expect(refused.picture).toEqual(before.picture);
      expect(refused.fieldInFrame).toBe(true);
      expect(refused.messageClipped).toBe(false);
      expect(refused.messageOverTile).toBe(true);
      expect(refused.messageShown).toBe(true);
      expect(refused.message!.width).toBeGreaterThanOrEqual(refused.field!.width - 4);
      if (!display.touch) {
        expect(refused.messageInside).toBe(true);
      }
    } finally {
      await page.context().close();
    }
  });
});
