// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

type Size = "portrait" | "landscape" | "small";

const CAST = "Assets/Images/Cast";
const PICTURE = `${CAST}/picture_000.png`;
const FOLDER = `${CAST}/Crew`;

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

const open = async ({ width, size, touch = false }: { width: number; size: Size; touch?: boolean }) => {
  const page = await openPage(browser, script, css, { width, touch, theme: "charcoal" });
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

const optionsOf = (path: string) => `[data-tile]:has(> [data-asset-path="${path}"]) > span > button`;

const measure = (page: Page, path: string) =>
  page.evaluate((selector) => {
    const button = document.querySelector<HTMLElement>(selector)!;
    const box = button.getBoundingClientRect();
    const tile = button.closest<HTMLElement>("[data-tile]")!.getBoundingClientRect();
    let opacity = 1;
    for (let node: HTMLElement | null = button; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    const menu = [...document.querySelectorAll<HTMLElement>('[role="menu"]')].find((element) => element.getBoundingClientRect().height > 0);
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      width: box.width,
      height: box.height,
      top: round(box.top - tile.top),
      right: round(tile.right - box.right),
      opacity,
      menuGap: menu ? round(menu.getBoundingClientRect().top - box.bottom) : null,
    };
  }, optionsOf(path));

describe("The Assets tile's options button matches the Folio prototype's (I-2550)", { timeout: 30_000 }, () => {
  it.each([
    { size: "portrait" as const, path: PICTURE, inset: 10 },
    { size: "landscape" as const, path: PICTURE, inset: 10 },
    { size: "small" as const, path: PICTURE, inset: 6 },
    { size: "portrait" as const, path: FOLDER, inset: 10 },
  ])("is 44 by 44 at $inset from the corner of a $size tile ($path) at 1440 with a mouse, and stays drawn with its menu 6 below it", async ({ size, path, inset }) => {
    const page = await open({ width: 1440, size });
    try {
      await page.locator(`[data-asset-path="${path}"]`).hover();
      await settle(page);
      expect(await measure(page, path)).toEqual({ width: 44, height: 44, top: inset, right: inset, opacity: 1, menuGap: null });
      await page.locator(optionsOf(path)).click();
      await settle(page);
      expect(await measure(page, path)).toEqual({ width: 44, height: 44, top: inset, right: inset, opacity: 1, menuGap: 6 });
    } finally {
      await page.context().close();
    }
  });

  it("is 44 by 44 and opens a bottom sheet at 430 with touch", async () => {
    const page = await open({ width: 430, size: "portrait", touch: true });
    try {
      const before = await measure(page, PICTURE);
      expect(before).toEqual({ width: 44, height: 44, top: 10, right: 10, opacity: 1, menuGap: null });
      await page.locator(optionsOf(PICTURE)).tap();
      await settle(page);
      const sheet = await page.evaluate(() => {
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        return dialog ? Math.round(window.innerHeight - dialog.getBoundingClientRect().bottom) : null;
      });
      expect(sheet).toBe(0);
    } finally {
      await page.context().close();
    }
  });
});
