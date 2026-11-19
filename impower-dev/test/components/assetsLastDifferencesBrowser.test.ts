// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

type Theme = "charcoal" | "chalk";

const CAST = "Assets/Images/Cast";
const STACK = [`${CAST}/stacked.png`, `${CAST}/stacked face.happy.png`, `${CAST}/stacked face.sad.png`];

let browser: Browser;
let script: string;
let css: string;
let previewScript: string;
let previewCss: string;
let scriptsScript: string;
let scriptsCss: string;

beforeAll(async () => {
  scriptsScript = await bundlePage("test/components/scriptsPageScrollPage.tsx", "test/components/scriptsPageScrollWorkspace.ts");
  scriptsCss = await stylesFor(scriptsScript);
  script = await bundlePage("test/components/assetsTileSizesPage.tsx", "test/components/assetsTileSizesWorkspace.ts");
  css = await stylesFor(script);
  previewScript = await bundlePage("test/components/previewTopBarPage.tsx", "test/components/assetsTileSizesWorkspace.ts");
  previewCss = await stylesFor(previewScript);
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const open = async ({ width, touch = false, theme = "charcoal" }: { width: number; touch?: boolean; theme?: Theme }) => {
  const page = await openPage(browser, script, css, { width, touch, theme });
  await page.evaluate(
    (setup) => window.assetsPage.mount(setup),
    { pictures: 3, extraPictures: STACK, counted: true, lists: { assetsLayouts: { [CAST]: "rows" } } },
  );
  await page.locator(`[data-asset-path="${CAST}/picture_000.png"]`).waitFor();
  await frames(page);
  return page;
};

const close = (page: Page) => page.context().close();

const settle = async (page: Page) => {
  await page.waitForTimeout(250);
  await frames(page);
};

const focusOf = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const target = document.querySelector(selector);
    return { focused: document.activeElement === target, ring: !!target?.matches(":focus-visible") };
  }, selector);

const separatorsOf = (page: Page) =>
  page.evaluate(() => {
    const menu = [...document.querySelectorAll<HTMLElement>('[role="menu"]')].find((element) => element.getBoundingClientRect().height > 0)!;
    const box = menu.getBoundingClientRect();
    return [...menu.querySelectorAll('[role="separator"]')].map((separator) => {
      const line = separator.getBoundingClientRect();
      const above = separator.previousElementSibling!.getBoundingClientRect().bottom;
      const below = separator.nextElementSibling!.getBoundingClientRect().top;
      const gap = (value: number) => Math.round(value * 10) / 10;
      return { left: line.left - box.left, right: box.right - line.right, height: line.height, above: gap(line.top - above), below: gap(below - line.bottom) };
    });
  });

const VIEW = '[data-assets-action="layout"]';
const ADD = '[data-assets-action="add"]';
const SORT = '[aria-label^="Sort by"]';

describe("The Assets page's last differences from the Folio prototype (I-2544)", { timeout: 30_000 }, () => {
  it.each([
    { width: 1440, touch: false, other: 60, otherPitch: 63 },
    { width: 820, touch: false, other: 62, otherPitch: 65 },
    { width: 430, touch: true, other: 62, otherPitch: 65 },
  ])("a picture row is 64 tall on a 67 pitch at $width, and a folder row keeps its $other on $otherPitch", async ({ width, touch, other, otherPitch }) => {
    const page = await open({ width, touch });
    try {
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-asset-path]")].map((row) => {
          const box = row.getBoundingClientRect();
          return { path: row.dataset.assetPath!, top: box.top, height: box.height };
        }),
      );
      const folder = rows.findIndex((row) => row.path === "Assets/Images/Cast/Crew");
      const pictures = rows.filter((row) => row.path.endsWith(".png"));
      expect(pictures.length).toBeGreaterThanOrEqual(3);
      expect(pictures.map((row) => row.height)).toEqual(pictures.map(() => 64));
      expect(pictures.slice(1).map((row, index) => row.top - pictures[index]!.top)).toEqual(pictures.slice(1).map(() => 67));
      expect(rows[folder]!.height).toBe(other);
      expect(rows[folder + 1]!.top - rows[folder]!.top).toBe(otherPitch);
    } finally {
      await close(page);
    }
  });

  it.each<Theme>(["charcoal", "chalk"])("the list row's variants chip is 19 tall and stands 14.3px below the row's top in %s", async (theme) => {
    const page = await open({ width: 1440, theme });
    try {
      const chip = await page.evaluate(() => {
        const box = document.querySelector("[data-variants-chip]")!.getBoundingClientRect();
        const row = document.querySelector("[data-variants-chip]")!.closest("[data-asset-path]")!.getBoundingClientRect();
        return { height: box.height, top: Math.round((box.top - row.top) * 10) / 10 };
      });
      expect(chip).toEqual({ height: 19, top: 14.3 });
    } finally {
      await close(page);
    }
  });

  it.each([{ width: 1440 }, { width: 820 }, { width: 430 }])("the View menu is at least 196 wide with its right edge on the button's at $width with a mouse", async ({ width }) => {
    const page = await open({ width });
    try {
      await page.locator(VIEW).click();
      await settle(page);
      const measured = await page.evaluate((selector) => {
        const element = document.querySelector<HTMLElement>('[role="menu"]')!;
        const menu = element.getBoundingClientRect();
        const button = document.querySelector(selector)!.getBoundingClientRect();
        return { minWidth: getComputedStyle(element).minWidth, wide: menu.width >= 196, right: Math.round(menu.right - button.right) || 0 };
      }, VIEW);
      expect(measured).toEqual({ minWidth: "196px", wide: true, right: 0 });
    } finally {
      await close(page);
    }
  });

  describe("a menu's button after the menu closes", () => {
    it("shows no focus ring after a mouse pick in the View menu, and shows it after a keyboard open and Escape", async () => {
      const page = await open({ width: 1440 });
      try {
        await page.locator(VIEW).click();
        await settle(page);
        await page.getByRole("menuitemradio", { name: /Small tiles/ }).click();
        await settle(page);
        expect(await focusOf(page, VIEW)).toEqual({ focused: true, ring: false });
        await page.keyboard.press("Enter");
        await settle(page);
        expect(await page.locator('[role="menu"]').count()).toBe(1);
        await page.keyboard.press("Escape");
        await settle(page);
        expect(await focusOf(page, VIEW)).toEqual({ focused: true, ring: true });
      } finally {
        await close(page);
      }
    });

    it("shows no focus ring after a mouse pick in the Sort menu", async () => {
      const page = await open({ width: 1440 });
      try {
        await page.locator(SORT).click();
        await settle(page);
        await page.getByRole("menuitemradio").nth(1).click();
        await settle(page);
        expect(await focusOf(page, SORT)).toEqual({ focused: true, ring: false });
      } finally {
        await close(page);
      }
    });

    it("shows no focus ring after the Add menu is dismissed by a click outside, and shows it after Escape from the keyboard", async () => {
      const page = await open({ width: 1440 });
      try {
        await page.locator(ADD).click();
        await settle(page);
        await page.mouse.click(1400, 880);
        await settle(page);
        expect(await page.locator('[role="menu"]').count()).toBe(0);
        expect(await focusOf(page, ADD)).toEqual({ focused: true, ring: false });
        await page.keyboard.press("Enter");
        await settle(page);
        await page.keyboard.press("Escape");
        await settle(page);
        expect(await focusOf(page, ADD)).toEqual({ focused: true, ring: true });
      } finally {
        await close(page);
      }
    });

    it("returns focus without a ring from the Add a link dialog dismissed by a click on its backdrop, and with one after Escape from the keyboard", async () => {
      const page = await open({ width: 1440 });
      try {
        await page.locator(ADD).click({ timeout: 4000 });
        await settle(page);
        await page.getByRole("menuitem", { name: /Add a link/ }).click({ timeout: 4000 });
        await page.waitForFunction(() => !!document.querySelector('[role="dialog"]'), undefined, { timeout: 4000 });
        await settle(page);
        await page.mouse.click(20, 880);
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), undefined, { timeout: 4000 });
        await settle(page);
        expect(await focusOf(page, ADD)).toEqual({ focused: true, ring: false });
        await page.keyboard.press("Enter");
        await settle(page);
        await page.waitForFunction(() => !!document.activeElement?.closest('[role="menu"]'), undefined, { timeout: 4000 });
        let onLink = false;
        for (let step = 0; step < 8 && !onLink; step += 1) {
          await page.keyboard.press("ArrowDown");
          await frames(page);
          onLink = await page.evaluate(
            () => !!document.activeElement?.matches('[role="menuitem"]') && !!document.activeElement.textContent?.includes("Add a link"),
          );
        }
        expect(onLink).toBe(true);
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => !!document.querySelector('[role="dialog"]'), undefined, { timeout: 4000 });
        await settle(page);
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), undefined, { timeout: 4000 });
        await settle(page);
        expect(await focusOf(page, ADD)).toEqual({ focused: true, ring: true });
      } finally {
        await close(page);
      }
    });
  });

  it("returns focus without a ring to the View and Add buttons after a finger closes their sheets", async () => {
    const page = await open({ width: 430, touch: true });
    try {
      await page.locator(VIEW).tap();
      await settle(page);
      expect(await page.locator('[role="dialog"] [role="menu"]').count()).toBe(1);
      await page.locator('[role="menuitemradio"]', { hasText: "Small tiles" }).tap();
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), undefined, { timeout: 4000 });
      await settle(page);
      expect(await focusOf(page, VIEW)).toEqual({ focused: true, ring: false });
      await page.locator(ADD).tap();
      await settle(page);
      expect(await page.locator('[role="dialog"] [role="menu"]').count()).toBe(1);
      await page.touchscreen.tap(215, 60);
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), undefined, { timeout: 4000 });
      await settle(page);
      expect(await focusOf(page, ADD)).toEqual({ focused: true, ring: false });
    } finally {
      await close(page);
    }
  });

  it("returns focus without a ring to the preview settings button after a click outside its menu, and with one after Escape from the keyboard", async () => {
    const page = await openPage(browser, previewScript, previewCss, { width: 1440 });
    const trigger = '[aria-label="Preview settings"]';
    try {
      await page.evaluate(() => window.previewTopBar.mount());
      await page.locator(trigger).click({ timeout: 4000 });
      await settle(page);
      expect(await page.locator('[role="menu"]').count()).toBe(1);
      await page.mouse.click(700, 850);
      await settle(page);
      expect(await page.locator('[role="menu"]').count()).toBe(0);
      expect(await focusOf(page, trigger)).toEqual({ focused: true, ring: false });
      await page.keyboard.press("Enter");
      await settle(page);
      await page.keyboard.press("Escape");
      await settle(page);
      expect(await focusOf(page, trigger)).toEqual({ focused: true, ring: true });
    } finally {
      await close(page);
    }
  });

  describe("menu separators sit inside the menu's 6px padding, 7px in from each outer edge", () => {
    it.each<Theme>(["charcoal", "chalk"])("in the Sort and folder menus in %s", async (theme) => {
      const page = await open({ width: 1440, theme });
      try {
        await page.locator(SORT).click();
        await settle(page);
        expect(await separatorsOf(page)).toEqual([{ left: 7, right: 7, height: 1, above: 6, below: 6 }]);
        await page.keyboard.press("Escape");
        await settle(page);
        await page.locator('[aria-label="Options for Crew"]').click();
        await settle(page);
        expect(await separatorsOf(page)).toEqual([{ left: 7, right: 7, height: 1, above: 6, below: 6 }]);
      } finally {
        await close(page);
      }
    });

    it("in the Scripts page's Sort menu, 4px from the rows on either side as the prototype's Scripts menus space it", async () => {
      const page = await openPage(browser, scriptsScript, scriptsCss, { width: 1440 });
      try {
        await page.evaluate(() => window.scriptsPage.mount());
        await page.locator(SORT).first().click({ timeout: 4000 });
        await settle(page);
        expect(await separatorsOf(page)).toEqual([{ left: 7, right: 7, height: 1, above: 4, below: 4 }]);
      } finally {
        await close(page);
      }
    });

    it("in the inspector's menu and its file menu", async () => {
      const page = await open({ width: 1440 });
      try {
        await page.locator(`[data-asset-path="${CAST}/stacked.png"]`).click();
        await page.locator("[data-asset-inspector]").waitFor();
        await settle(page);
        const menus = page.locator('[data-asset-inspector] [aria-label^="Options for "]');
        expect(await menus.count()).toBeGreaterThan(1);
        await menus.first().click();
        await settle(page);
        expect(await separatorsOf(page)).toEqual([{ left: 7, right: 7, height: 1, above: 6, below: 6 }]);
        await page.keyboard.press("Escape");
        await settle(page);
        await menus.nth(1).scrollIntoViewIfNeeded();
        await menus.nth(1).click();
        await settle(page);
        expect(await separatorsOf(page)).toEqual([{ left: 7, right: 7, height: 1, above: 6, below: 6 }]);
      } finally {
        await close(page);
      }
    });
  });

  it.each([
    { name: "stacked", note: "Nothing shows it yet. Copy its name into a line of the script, or insert a variant from above." },
    { name: "picture_000", note: "Nothing shows it yet. Copy its name into a line of the script." },
  ])("the inspector's unused-file hint for $name reads as the prototype's", async ({ name, note }) => {
    const page = await open({ width: 1440 });
    try {
      await page.locator(`[data-asset-path="${CAST}/${name}.png"]`).click();
      const hint = page.locator("[data-asset-inspector] p", { hasText: /^Nothing shows it yet\./ });
      await hint.waitFor();
      expect({ text: await hint.textContent(), shown: ((await hint.boundingBox())?.height ?? 0) > 0 }).toEqual({ text: note, shown: true });
    } finally {
      await close(page);
    }
  });
});
