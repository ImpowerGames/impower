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
