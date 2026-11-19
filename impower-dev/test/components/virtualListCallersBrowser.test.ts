// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

type Kind = "scripts" | "shell";

let browser: Browser;
const pages: Record<Kind, { script: string; css: string }> = {} as Record<Kind, { script: string; css: string }>;

beforeAll(async () => {
  const scripts = await bundlePage("test/components/scriptsPageScrollPage.tsx", "test/components/scriptsPageScrollWorkspace.ts");
  const shell = await bundlePage("test/components/outlineShellRailPage.tsx", "test/components/outlineShellRailWorkspace.ts");
  pages.scripts = { script: scripts, css: await stylesFor(scripts) };
  pages.shell = { script: shell, css: await stylesFor(shell) };
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (): Promise<Page> => {
  const page = await openPage(browser, pages.scripts.script, pages.scripts.css, { width: 1440, height: 900 });
  await page.evaluate(() => window.scriptsPage.mount());
  await page.locator('[role="listitem"]').first().waitFor();
  await page.evaluate(() => {
    const scroller = document.querySelector('[role="list"]')!.parentElement!;
    scroller.scrollTop = Math.round(scroller.scrollHeight / 3);
  });
  await frames(page);
  await page.evaluate(() => {
    const scroller = document.querySelector('[role="list"]')!.parentElement!;
    const top = scroller.getBoundingClientRect().top;
    const item = [...document.querySelectorAll<HTMLElement>('[role="listitem"]')].find((row) => row.getBoundingClientRect().top - top > 60)!;
    item.querySelector<HTMLElement>("button[aria-label]")!.focus({ preventScroll: true });
  });
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
  it("keeps the Scripts list's scroll and focused row as the window crosses 1100 and 700 and back", async () => {
    const kind = "scripts";
    const page = await open();
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
    const page = await open();
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

describe("the shell's Outline rail keeps its place and focused row (I-2546)", () => {
  const openShell = async (): Promise<Page> => {
    const page = await openPage(browser, pages.shell.script, pages.shell.css, { width: 1440, height: 900 });
    await page.locator('nav[aria-label="Outline"] [role="listitem"]').first().waitFor();
    await frames(page);
    await page.evaluate(() => {
      document.querySelector('nav[aria-label="Outline"] [role="list"]')!.parentElement!.scrollTop = 300;
    });
    await frames(page);
    await page.evaluate(() => {
      const scroller = document.querySelector('nav[aria-label="Outline"] [role="list"]')!.parentElement!;
      const top = scroller.getBoundingClientRect().top;
      const item = [...scroller.querySelectorAll<HTMLElement>('[role="listitem"]')].find((row) => row.getBoundingClientRect().top - top > 100)!;
      item.querySelector<HTMLElement>("button[aria-label]")!.focus();
    });
    await frames(page);
    return page;
  };

  const rail = (page: Page) =>
    page.evaluate(() => {
      const scroller = document.querySelector('nav[aria-label="Outline"] [role="list"]')?.parentElement;
      const shown = !!scroller && scroller.clientHeight > 0;
      const focused = document.activeElement?.closest('nav[aria-label="Outline"] [role="listitem"]') ? document.activeElement : null;
      const current = scroller?.querySelector<HTMLElement>('[aria-current="location"]');
      const box = scroller?.getBoundingClientRect();
      const row = current?.getBoundingClientRect();
      return {
        layout: document.documentElement.dataset.layout,
        sidebar: document.querySelector("[data-sidebar]")?.getAttribute("data-sidebar") ?? null,
        shown,
        scrollTop: shown ? scroller!.scrollTop : null,
        focus: focused?.getAttribute("aria-label") ?? null,
        currentInView: !!box && !!row && row.top >= box.top && row.bottom <= box.bottom,
        current: current?.getAttribute("aria-label") ?? null,
      };
    });

  const resize = async (page: Page, width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await frames(page);
    await frames(page);
  };

  it("keeps the rail's scroll and focused row as the window collapses the rail, hides it below 700 and widens again", async () => {
    const page = await openShell();
    try {
      const start = await rail(page);
      expect(start.shown).toBe(true);
      expect(start.scrollTop).toBe(300);
      expect(start.focus).toMatch(/scene_\d+$/);
      for (const [width, sidebar] of [
        [1000, "collapsed"],
        [1440, "expanded"],
        [650, null],
        [1440, "expanded"],
        [1050, "expanded"],
        [820, "collapsed"],
        [650, null],
        [1000, "collapsed"],
        [1440, "expanded"],
      ] as const) {
        await resize(page, width);
        const now = await rail(page);
        expect(now.sidebar, `at ${width}`).toBe(sidebar);
        expect(now.shown, `at ${width}`).toBe(sidebar === "expanded");
        if (now.shown) {
          expect(now.scrollTop, `at ${width}`).toBe(start.scrollTop);
          expect(now.focus, `at ${width}`).toBe(start.focus);
        }
      }
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it("leaves focus where the author moved it while the rail was hidden", async () => {
    const page = await openShell();
    try {
      await resize(page, 1000);
      await page.evaluate(() => {
        const elsewhere = document.body.appendChild(document.createElement("button"));
        elsewhere.id = "elsewhere";
        elsewhere.focus();
      });
      await resize(page, 1440);
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("elsewhere");
      expect((await rail(page)).scrollTop).toBe(300);
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it("shows the current row when the caret moves to another scene, and on return when it moved while the rail was away", async () => {
    const page = await openShell();
    try {
      await page.evaluate(() => window.shellRail.caret(4 * 39));
      await frames(page);
      const moved = await rail(page);
      expect(moved.current).toMatch(/scene_39/);
      expect(moved.currentInView).toBe(true);
      for (const [width, scene] of [
        [1000, 0],
        [650, 35],
        [820, 2],
      ] as const) {
        await resize(page, width);
        await page.evaluate((line) => window.shellRail.caret(line), 4 * scene);
        await frames(page);
        await resize(page, 1440);
        const back = await rail(page);
        expect(back.current, `after ${width}`).toMatch(new RegExp(`scene_${scene}$`));
        expect(back.currentInView, `after ${width}`).toBe(true);
      }
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
