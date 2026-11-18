// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

type Kind = "scripts" | "rail";

let browser: Browser;
const pages: Record<Kind, { script: string; css: string }> = {} as Record<Kind, { script: string; css: string }>;

beforeAll(async () => {
  const scripts = await bundlePage("test/components/scriptsPageScrollPage.tsx", "test/components/scriptsPageScrollWorkspace.ts");
  const rail = await bundlePage("test/components/outlineRailScrollPage.tsx");
  pages.scripts = { script: scripts, css: await stylesFor(scripts) };
  pages.rail = { script: rail, css: await stylesFor(rail) };
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (kind: Kind): Promise<Page> => {
  const page = await openPage(browser, pages[kind].script, pages[kind].css, { width: 1440, height: 900 });
  if (kind === "scripts") {
    await page.evaluate(() => window.scriptsPage.mount());
  }
  await page.locator('[role="listitem"]').first().waitFor();
  await page.evaluate(() => {
    const scroller = document.querySelector('[role="list"]')!.parentElement!;
    scroller.scrollTop = Math.round(scroller.scrollHeight / 3);
  });
  await frames(page);
  await page.evaluate((kind) => {
    const scroller = document.querySelector('[role="list"]')!.parentElement!;
    const top = scroller.getBoundingClientRect().top;
    const item = [...document.querySelectorAll<HTMLElement>('[role="listitem"]')].find((row) => row.getBoundingClientRect().top - top > 60)!;
    const target = kind === "scripts" ? item.querySelector<HTMLElement>("button[aria-label]")! : (item.querySelector<HTMLElement>("button") ?? item);
    target.focus({ preventScroll: true });
  }, kind);
  await frames(page);
  return page;
};

const read = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector('[role="list"]')!.parentElement!;
    const focused = document.activeElement?.closest('[role="listitem"]');
    return {
      layout: document.documentElement.dataset.layout,
      scrollTop: scroller.scrollTop,
      focus: focused?.getAttribute("aria-posinset") ?? null,
      focusTop: focused ? Math.round(focused.getBoundingClientRect().top - scroller.getBoundingClientRect().top) : null,
    };
  });

describe("lists of rows keep their place and focus across the layout breakpoints (I-2462)", () => {
  it.each(["scripts", "rail"] as const)("keeps the %s list's scroll and focused row as the window crosses 1100 and 700 and back", async (kind) => {
    const page = await open(kind);
    try {
      const start = await read(page);
      expect(start.focus).not.toBeNull();
      expect(start.scrollTop).toBeGreaterThan(0);
      for (const [width, layout] of [
        [1050, "compact"],
        [820, "compact"],
        [650, "phone"],
        [1440, "desktop"],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await frames(page);
        await frames(page);
        const now = await read(page);
        expect(now.layout, `${kind} at ${width}`).toBe(layout);
        expect(now.scrollTop, `${kind} at ${width}`).toBe(start.scrollTop);
        expect(now.focus, `${kind} at ${width}`).toBe(start.focus);
      }
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it("keeps the Scripts list's scroll when a row is inserted above and when the window narrows within desktop", async () => {
    const page = await open("scripts");
    try {
      const start = await read(page);
      await page.evaluate(() => window.scriptsPage.insert("scene_000a"));
      await frames(page);
      const inserted = await read(page);
      expect(inserted.scrollTop).toBe(start.scrollTop);
      expect(Number(inserted.focus)).toBe(Number(start.focus) + 1);
      await page.setViewportSize({ width: 1300, height: 900 });
      await frames(page);
      await frames(page);
      expect(await read(page)).toEqual(inserted);
    } finally {
      await page.context().close();
    }
  }, 60_000);
});

describe("the Scripts list keeps each folder's place (I-2545)", () => {
  const FOLDER_KEY = "all:Scripts/Deep:";

  const mountScripts = async (lists: Record<string, unknown> = {}) => {
    const page = await openPage(browser, pages.scripts.script, pages.scripts.css, { width: 1440, height: 900 });
    await page.evaluate((setup) => window.scriptsPage.mount(setup), { folder: "Scripts/Deep", lists });
    await page.locator('[role="listitem"]').first().waitFor();
    await frames(page);
    return page;
  };

  const scrollTop = (page: Page) => page.evaluate(() => document.querySelector('[role="list"]')!.parentElement!.scrollTop);

  const scrollTo = async (page: Page, top: number) => {
    await page.evaluate((to) => {
      document.querySelector('[role="list"]')!.parentElement!.scrollTop = to;
    }, top);
    await frames(page);
  };

  const saved = (page: Page) => page.evaluate(() => (window.scriptsPage.lists().scriptsScrolls as Record<string, number> | undefined) ?? {});

  it("reopens a scrolled folder where it was left after a visit to its parent", async () => {
    const page = await mountScripts();
    try {
      await scrollTo(page, 2000);
      expect(await scrollTop(page)).toBe(2000);
      await page.locator('[aria-label="Parent folder"]').click();
      await page.locator('[aria-label^="Open folder Deep"]').waitFor();
      await frames(page);
      expect(await scrollTop(page)).toBe(0);
      await page.locator('[aria-label^="Open folder Deep"]').click();
      await page.locator('[aria-label^="Open folder Deep"]').waitFor({ state: "detached" });
      await frames(page);
      await frames(page);
      expect(await scrollTop(page)).toBe(2000);
      expect((await saved(page))[FOLDER_KEY]).toBe(2000);
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it("saves a folder's latest position while it stays open, and a page opened on those lists opens there", async () => {
    const page = await mountScripts({ scriptsScrolls: { [FOLDER_KEY]: 1000 } });
    let lists: Record<string, unknown> = {};
    try {
      expect(await scrollTop(page)).toBe(1000);
      await scrollTo(page, 2400);
      await page.waitForTimeout(1000);
      expect((await saved(page))[FOLDER_KEY]).toBe(2400);
      lists = await page.evaluate(() => window.scriptsPage.lists());
    } finally {
      await page.context().close();
    }
    const reloaded = await mountScripts(lists);
    try {
      await frames(reloaded);
      expect(await scrollTop(reloaded)).toBe(2400);
    } finally {
      await reloaded.context().close();
    }
  }, 60_000);
});
