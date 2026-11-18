// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, openPage, stylesFor } from "./pageBundle";

type Size = "Portrait tiles" | "Landscape tiles" | "Small tiles";
type Pointer = "mouse" | "touch";
type Theme = "charcoal" | "chalk";

const SIZES: readonly Size[] = ["Portrait tiles", "Landscape tiles", "Small tiles"];

const PROTOTYPE = {
  "Portrait tiles": { ratio: 4 / 3, padX: 8, chrome: 2 + 8 + 9 + 13 * 1.4 + 2 + 11 * 1.4 + 10, name: "13px", sub: true, dots: 44, dotsAt: 10, mark: 22, markAt: 14 },
  "Landscape tiles": { ratio: 10 / 16, padX: 8, chrome: 2 + 8 + 9 + 13 * 1.4 + 2 + 11 * 1.4 + 10, name: "13px", sub: true, dots: 44, dotsAt: 10, mark: 22, markAt: 14 },
  "Small tiles": { ratio: 1, padX: 5, chrome: 2 + 5 + 6 + 11 * 1.4 + 7, name: "11px", sub: false, dots: 44, dotsAt: 6, mark: 18, markAt: 9 },
} as const;

const GRIDS: Record<"desktop" | "pane" | "narrow", Record<Size, { min: number; gap: number }>> = {
  desktop: { "Portrait tiles": { min: 138, gap: 12 }, "Landscape tiles": { min: 176, gap: 12 }, "Small tiles": { min: 96, gap: 8 } },
  pane: { "Portrait tiles": { min: 140, gap: 12 }, "Landscape tiles": { min: 150, gap: 12 }, "Small tiles": { min: 96, gap: 8 } },
  narrow: { "Portrait tiles": { min: 150, gap: 10 }, "Landscape tiles": { min: 160, gap: 10 }, "Small tiles": { min: 88, gap: 8 } },
};

const expectedColumns = (width: number, { min, gap }: { min: number; gap: number }) => {
  const columns = Math.max(1, Math.floor((width + gap) / (min + gap)));
  return { columns, width: (width - gap * (columns - 1)) / columns };
};

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

type Open = { width: number; height?: number; pointer: Pointer; theme?: Theme; pane?: number; pictures?: number; lists?: Record<string, unknown>; reveal?: readonly string[] };

const open = async ({ width, height = 900, pointer, theme = "charcoal", pane, pictures, lists, reveal }: Open): Promise<Page> => {
  const page = await openPage(browser, script, css, { width, height, touch: pointer === "touch", theme });
  await page.evaluate((setup) => window.assetsPage.mount(setup), { width: pane, pictures, lists, reveal });
  await page.locator('[role="listitem"] [data-tile]').first().waitFor();
  return page;
};

const close = (page: Page) => page.context().close();

const press = async (page: Page, selector: string, pointer: Pointer) => {
  const target = page.locator(selector).first();
  await target.waitFor();
  if (pointer === "touch") {
    await target.tap();
  } else {
    await target.click();
  }
};

const menuEntries = (page: Page) =>
  page.locator('[role="menuitemradio"]').evaluateAll((items) =>
    items.map((item) => ({
      label: item.textContent!.trim(),
      checked: item.getAttribute("aria-checked"),
      icon: item.querySelector("svg:not([data-radio-indicator])")!.innerHTML,
      weight: getComputedStyle(item).fontWeight,
    })),
  );

const openMenu = async (page: Page, pointer: Pointer) => {
  await press(page, '[data-assets-action="layout"]', pointer);
  await page.locator('[role="menuitemradio"]').first().waitFor();
};

const pick = async (page: Page, entry: Size | "List", pointer: Pointer) => {
  await press(page, `[role="menuitemradio"]:has-text("${entry}")`, pointer);
  await page.locator('[role="menuitemradio"]').first().waitFor({ state: "detached" });
  await frames(page);
};

const choose = async (page: Page, entry: Size | "List", pointer: Pointer) => {
  await openMenu(page, pointer);
  await pick(page, entry, pointer);
};

const grid = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[role="list"]')!;
    const cells = [...list.querySelectorAll<HTMLElement>('[role="listitem"]')].map((cell) => cell.getBoundingClientRect());
    const top = Math.min(...cells.map((cell) => cell.top));
    const first = cells.filter((cell) => Math.abs(cell.top - top) < 0.5).sort((a, b) => a.left - b.left);
    const file = [...list.querySelectorAll<HTMLElement>("[data-tile]")].find((tile) => tile.querySelector('button[aria-label^="Open image"]'))!;
    const box = (element: Element | null) => {
      const rect = element!.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const tile = box(file);
    const open = file.querySelector<HTMLElement>('button[aria-label^="Open image"]')!;
    const media = open.firstElementChild!;
    const copy = media.nextElementSibling!;
    const name = copy.firstElementChild!;
    const sub = copy.querySelector("small");
    const dots = file.querySelector<HTMLElement>('button[aria-label^="Options for"]')!;
    const mark = file.querySelector("label")!;
    const markHit = getComputedStyle(mark, "::after");
    return {
      listWidth: list.clientWidth,
      columns: first.length,
      cellWidth: first[0]!.width,
      gap: first.length > 1 ? first[1]!.left - first[0]!.right : null,
      cellHeight: first[0]!.height,
      tile,
      open: box(open),
      openPadding: getComputedStyle(open).padding,
      openRadius: getComputedStyle(open).borderRadius,
      media: box(media),
      name: { size: getComputedStyle(name).fontSize, lineHeight: getComputedStyle(name).lineHeight },
      sub: sub ? getComputedStyle(sub).display : null,
      dots: box(dots),
      mark: box(mark.querySelector("span")),
      markHit: markHit.content === "none" ? null : { inset: markHit.top, position: markHit.position },
    };
  });

const pictureFit = (page: Page) =>
  page.evaluate(() => {
    const fits: Record<string, { width: number; height: number; centre: number; mediaWidth: number; mediaHeight: number; mediaCentre: number; fit: string }> = {};
    for (const tile of document.querySelectorAll<HTMLElement>('[role="list"] [data-tile]')) {
      const image = tile.querySelector("img");
      const label = tile.querySelector('button[aria-label^="Open image"]')?.getAttribute("aria-label");
      if (!image || !label) continue;
      const media = image.closest('[data-tile] button > span')!.getBoundingClientRect();
      const rect = image.getBoundingClientRect();
      fits[label.split(",")[0]!.replace("Open image ", "")] = {
        width: rect.width,
        height: rect.height,
        centre: rect.left + rect.width / 2,
        mediaWidth: media.width,
        mediaHeight: media.height,
        mediaCentre: media.left + media.width / 2,
        fit: getComputedStyle(image).objectFit,
      };
    }
    return fits;
  });

const checkGeometry = async (page: Page, size: Size, grids: Record<Size, { min: number; gap: number }>, pointer: Pointer) => {
  const read = await grid(page);
  const spec = PROTOTYPE[size];
  const expected = expectedColumns(read.listWidth, grids[size]);
  expect(read.columns, `${size} columns at list width ${read.listWidth}`).toBe(expected.columns);
  expect(read.cellWidth).toBeCloseTo(expected.width, 1);
  if (expected.columns > 1) expect(read.gap).toBeCloseTo(grids[size].gap, 1);
  const mediaWidth = expected.width - 2 - spec.padX * 2;
  expect(read.media.width).toBeCloseTo(mediaWidth, 1);
  expect(read.media.height / read.media.width).toBeCloseTo(spec.ratio, 2);
  expect(read.open.height).toBeCloseTo(mediaWidth * spec.ratio + spec.chrome, 0);
  expect(read.cellHeight).toBeCloseTo(read.open.height, 0);
  expect(read.name.size).toBe(spec.name);
  expect(read.sub === null || read.sub === "none" ? false : true).toBe(spec.sub);
  expect(read.dots.width).toBeCloseTo(spec.dots, 1);
  expect(read.dots.height).toBeCloseTo(spec.dots, 1);
  expect(read.dots.top - read.tile.top).toBeCloseTo(spec.dotsAt, 1);
  expect(read.tile.right - read.dots.right).toBeCloseTo(spec.dotsAt, 1);
  expect(read.mark.width).toBeCloseTo(spec.mark, 1);
  expect(read.mark.top - read.tile.top).toBeCloseTo(spec.markAt, 1);
  expect(read.mark.left - read.tile.left).toBeCloseTo(spec.markAt, 1);
  if (pointer === "touch") {
    expect(read.markHit).toEqual({ inset: `${-(44 - spec.mark) / 2}px`, position: "absolute" });
  }
  return read;
};

const CASES: { name: string; open: Open; grids: Record<Size, { min: number; gap: number }> }[] = [
  { name: "1440 with a mouse in Charcoal", open: { width: 1440, pointer: "mouse" }, grids: GRIDS.desktop },
  { name: "1440 with a mouse in Chalk", open: { width: 1440, pointer: "mouse", theme: "chalk" }, grids: GRIDS.desktop },
  { name: "1440 under touch", open: { width: 1440, pointer: "touch" }, grids: GRIDS.desktop },
  { name: "1440 in a 400 pane", open: { width: 1440, pointer: "mouse", pane: 400 }, grids: GRIDS.pane },
  { name: "820 with a mouse", open: { width: 820, height: 1180, pointer: "mouse" }, grids: GRIDS.narrow },
  { name: "820 under touch in Chalk", open: { width: 820, height: 1180, pointer: "touch", theme: "chalk" }, grids: GRIDS.narrow },
  { name: "430 under touch", open: { width: 430, height: 932, pointer: "touch" }, grids: GRIDS.narrow },
  { name: "430 under touch in Chalk", open: { width: 430, height: 932, pointer: "touch", theme: "chalk" }, grids: GRIDS.narrow },
];

describe("the Assets page's View menu and tile sizes, in Chromium (I-2462)", () => {
  it.each(CASES)("offers the prototype's four entries and draws each tile size at its geometry: $name", async ({ open: setup, grids }) => {
    const page = await open({ pictures: 20, ...setup });
    try {
      await openMenu(page, setup.pointer);
      const entries = await menuEntries(page);
      expect(entries.map((entry) => entry.label)).toEqual(["Portrait tiles", "Landscape tiles", "Small tiles", "List"]);
      expect(new Set(entries.slice(0, 3).map((entry) => entry.icon)).size).toBe(1);
      expect(entries[3]!.icon).not.toBe(entries[0]!.icon);
      expect(entries.map((entry) => entry.weight)).toEqual(["400", "400", "400", "400"]);
      for (const size of SIZES) {
        await pick(page, size, setup.pointer);
        expect(await page.locator('[data-assets-action="layout"]').getAttribute("data-layout")).toBe(
          { "Portrait tiles": "portrait", "Landscape tiles": "landscape", "Small tiles": "small" }[size],
        );
        await checkGeometry(page, size, grids, setup.pointer);
        await openMenu(page, setup.pointer);
        expect((await menuEntries(page)).map((entry) => entry.checked)).toEqual(
          ["Portrait tiles", "Landscape tiles", "Small tiles", "List"].map((label) => String(label === size)),
        );
      }
      await pick(page, "List", setup.pointer);
      expect(await page.locator('[role="list"] [data-tile]').count()).toBe(0);
      expect(await page.locator('[data-assets-action="layout"]').getAttribute("data-layout")).toBe("rows");
    } finally {
      await close(page);
    }
  }, 120_000);

  it("takes the narrower layout's columns and gaps when the window crosses 1100 and the list keeps its width", async () => {
    const page = await open({ width: 1440, pointer: "mouse", pictures: 40 });
    try {
      for (const size of SIZES) {
        await choose(page, size, "mouse");
        const box = () =>
          page.evaluate(() => {
            const scroller = document.querySelector<HTMLElement>('[role="list"]')!.parentElement!;
            return [scroller.clientWidth, scroller.clientHeight];
          });
        await page.setViewportSize({ width: 1440, height: 900 });
        await frames(page);
        const before = await box();
        await page.setViewportSize({ width: 1050, height: 900 });
        await frames(page);
        const shift = before[1]! - (await box())[1]!;
        await page.setViewportSize({ width: 1440, height: 900 });
        await frames(page);
        await frames(page);
        const wide = await checkGeometry(page, size, GRIDS.desktop, "mouse");
        expect(await box(), size).toEqual(before);
        await page.setViewportSize({ width: 1050, height: 900 + shift });
        await frames(page);
        await frames(page);
        expect(await box(), size).toEqual(before);
        expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe("compact");
        const narrow = await checkGeometry(page, size, GRIDS.narrow, "mouse");
        expect(narrow.listWidth, size).toBe(wide.listWidth);
      }
    } finally {
      await close(page);
    }
  }, 90_000);

  it.each([
    { width: 430, height: 932, pointer: "touch" as const, size: "portrait", saved: 22000 },
    { width: 430, height: 932, pointer: "touch" as const, size: "landscape", saved: 20000 },
  ])("reopens a deeply scrolled $size folder at its saved position $saved at $width", async ({ width, height, pointer, size, saved }) => {
    const page = await open({
      width,
      height,
      pointer,
      pictures: 240,
      lists: { assetsLayouts: { "Assets/Images/Cast": size }, assetsScrolls: { "image:Assets/Images/Cast:name-asc": saved } },
    });
    try {
      await frames(page);
      await frames(page);
      const restored = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[role="list"]')!.parentElement!;
        return { scrollTop: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight };
      });
      expect(restored.max).toBeGreaterThan(saved);
      expect(restored.scrollTop).toBeCloseTo(saved, 0);
    } finally {
      await close(page);
    }
  }, 60_000);

  it.each([
    { saved: 0, width: 1440, height: 900, pointer: "mouse" as const },
    { saved: 22000, width: 430, height: 932, pointer: "touch" as const },
  ])("opens on a picture another surface added, its top in view, over a saved position of $saved at $width", async ({ saved, width, height, pointer }) => {
    const page = await open({
      width,
      height,
      pointer,
      pictures: 240,
      reveal: ["Assets/Images/Cast/picture_150.png"],
      lists: { assetsLayouts: { "Assets/Images/Cast": "portrait" }, assetsScrolls: { "image:Assets/Images/Cast:name-asc": saved } },
    });
    try {
      await frames(page);
      await frames(page);
      const seen = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[role="list"]')!.parentElement!.getBoundingClientRect();
        const tile = document.querySelector<HTMLElement>('[data-asset-path="Assets/Images/Cast/picture_150.png"]');
        const box = tile?.getBoundingClientRect();
        return { found: !!tile, inView: !!box && box.top >= scroller.top - 1 && box.top < scroller.bottom };
      });
      expect(seen).toEqual({ found: true, inView: true });
    } finally {
      await close(page);
    }
  }, 60_000);

  it.each([
    { stored: "no stored choice", lists: {} },
    { stored: "the old stored Tiles", lists: { assetsLayouts: { "Assets/Images/Cast": "tiles" } } },
  ])("opens on a picture another surface added, its top in view, in a folder that measures its pictures, with $stored", async ({ lists }) => {
    const page = await open({
      width: 1440,
      pointer: "mouse",
      pictures: 240,
      reveal: ["Assets/Images/Cast/picture_150.png"],
      lists: { ...lists, assetsScrolls: { "image:Assets/Images/Cast:name-asc": 0 } },
    });
    try {
      await page.waitForFunction(() => !!document.querySelector('[data-asset-path="Assets/Images/Cast/picture_150.png"]'), undefined, { timeout: 10_000 }).catch(() => {});
      await frames(page);
      await frames(page);
      const seen = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[role="list"]')!.parentElement!.getBoundingClientRect();
        const tile = document.querySelector<HTMLElement>('[data-asset-path="Assets/Images/Cast/picture_150.png"]');
        const box = tile?.getBoundingClientRect();
        return { found: !!tile, inView: !!box && box.top >= scroller.top - 1 && box.top < scroller.bottom };
      });
      expect(seen).toEqual({ found: true, inView: true });
    } finally {
      await close(page);
    }
  }, 60_000);

  const CAST_KEY = "image:Assets/Images/Cast:name-asc";

  const position = (page: Page) =>
    page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[role="list"]')!.parentElement!;
      const top = scroller.getBoundingClientRect().top;
      const first = [...scroller.querySelectorAll<HTMLElement>("[data-asset-path]")].find((tile) => tile.getBoundingClientRect().bottom > top + 1);
      return { scrollTop: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight, first: first?.getAttribute("data-asset-path") ?? null };
    });

  const scrollTo = async (page: Page, top: number) => {
    await page.evaluate((to) => {
      document.querySelector<HTMLElement>('[role="list"]')!.parentElement!.scrollTop = to;
    }, top);
    await frames(page);
  };

  const savedScrolls = (page: Page) => page.evaluate(() => window.assetsPage.lists().assetsScrolls as Record<string, number> | undefined);

  const revealed = (page: Page, path: string) =>
    page.evaluate((target) => {
      const scroller = document.querySelector<HTMLElement>('[role="list"]')!.parentElement!.getBoundingClientRect();
      const box = document.querySelector<HTMLElement>(`[data-asset-path="${target}"]`)?.getBoundingClientRect();
      return { found: !!box, inView: !!box && box.top >= scroller.top - 1 && box.top < scroller.bottom };
    }, path);

  it.each([
    { when: "pending when the page opens", width: 1440, height: 900, pointer: "mouse" as const, pending: true },
    { when: "requested while the page is open", width: 1440, height: 900, pointer: "mouse" as const, pending: false },
    { when: "pending when the page opens", width: 430, height: 932, pointer: "touch" as const, pending: true },
  ])("opens another folder on a picture another surface added, its top in view over that folder's saved position, $when at $width (I-2545)", async ({ width, height, pointer, pending }) => {
    const target = "Assets/Images/Cast/picture_150.png";
    const page = await open({
      width,
      height,
      pointer,
      pictures: 240,
      reveal: pending ? [target] : undefined,
      lists: {
        assetsFolders: { image: "Assets/Images/Cast/Crew" },
        assetsLayouts: { "Assets/Images/Cast": "portrait" },
        assetsScrolls: { [CAST_KEY]: 0 },
      },
    });
    try {
      if (!pending) {
        await page.evaluate((path) => window.assetsPage.reveal([path]), target);
      }
      await page.waitForFunction(() => (window.assetsPage.lists().assetsFolders as Record<string, string>).image === "Assets/Images/Cast");
      await frames(page);
      await frames(page);
      await page.waitForTimeout(200);
      expect(await revealed(page, target)).toEqual({ found: true, inView: true });
      const shown = await position(page);
      expect(shown.scrollTop).toBeGreaterThan(0);
      await press(page, '[aria-label="Parent folder"]', pointer);
      await page.locator('[aria-label^="Open folder Cast"]').waitFor();
      await frames(page);
      await press(page, '[aria-label^="Open folder Cast"]', pointer);
      await page.locator('[aria-label^="Open folder Cast"]').waitFor({ state: "detached" });
      await frames(page);
      await frames(page);
      expect(await position(page)).toEqual(shown);
    } finally {
      await close(page);
    }
  }, 60_000);

  it.each([
    { width: 1440, height: 900, pointer: "mouse" as const },
    { width: 430, height: 932, pointer: "touch" as const },
  ])("reopens a scrolled folder where it was left after a visit to its parent, at $width (I-2545)", async ({ width, height, pointer }) => {
    const page = await open({ width, height, pointer, pictures: 240, lists: { assetsLayouts: { "Assets/Images/Cast": "portrait" } } });
    try {
      await frames(page);
      await scrollTo(page, 6000);
      const left = await position(page);
      expect(left.max).toBeGreaterThan(6000);
      expect(left.scrollTop).toBe(6000);
      await press(page, '[aria-label="Parent folder"]', pointer);
      await page.locator('[aria-label^="Open folder Cast"]').waitFor();
      await frames(page);
      expect((await position(page)).scrollTop).toBe(0);
      await press(page, '[aria-label^="Open folder Cast"]', pointer);
      await page.locator('[aria-label^="Open folder Cast"]').waitFor({ state: "detached" });
      await frames(page);
      await frames(page);
      expect(await position(page)).toEqual(left);
      expect((await savedScrolls(page))?.[CAST_KEY]).toBe(6000);

      await choose(page, "Small tiles", pointer);
      await frames(page);
      const anchored = await position(page);
      expect(anchored.scrollTop).not.toBe(6000);
      await press(page, '[aria-label="Parent folder"]', pointer);
      await page.locator('[aria-label^="Open folder Cast"]').waitFor();
      await frames(page);
      await press(page, '[aria-label^="Open folder Cast"]', pointer);
      await page.locator('[aria-label^="Open folder Cast"]').waitFor({ state: "detached" });
      await frames(page);
      await frames(page);
      expect(await position(page)).toEqual(anchored);
    } finally {
      await close(page);
    }
  }, 60_000);

  it("saves the latest position of a folder while it stays open, and a page opened on those lists opens there (I-2545)", async () => {
    const page = await open({
      width: 1440,
      pointer: "mouse",
      pictures: 240,
      lists: { assetsLayouts: { "Assets/Images/Cast": "portrait" }, assetsScrolls: { [CAST_KEY]: 3000 } },
    });
    let lists: Record<string, unknown> = {};
    try {
      await frames(page);
      expect((await position(page)).scrollTop).toBe(3000);
      await scrollTo(page, 6000);
      await scrollTo(page, 6400);
      await page.waitForTimeout(1000);
      expect((await savedScrolls(page))?.[CAST_KEY]).toBe(6400);
      lists = await page.evaluate(() => window.assetsPage.lists());
    } finally {
      await close(page);
    }
    const reloaded = await open({ width: 1440, pointer: "mouse", pictures: 240, lists });
    try {
      await frames(reloaded);
      await frames(reloaded);
      expect((await position(reloaded)).scrollTop).toBe(6400);
    } finally {
      await close(reloaded);
    }
  }, 60_000);

  it("takes the narrow pane's columns when the page's content box narrows to 440, and the desktop columns again at 441", async () => {
    const page = await open({ width: 1440, pointer: "mouse", pictures: 40, pane: 477 });
    try {
      const paneTo = async (width: number) => {
        await page.evaluate((width) => {
          document.getElementById("host")!.style.width = `${width}px`;
        }, width);
        await frames(page);
        await frames(page);
      };
      for (const size of SIZES) {
        await choose(page, size, "mouse");
        await checkGeometry(page, size, GRIDS.desktop, "mouse");
        await paneTo(476);
        await checkGeometry(page, size, GRIDS.pane, "mouse");
        await paneTo(477);
        await checkGeometry(page, size, GRIDS.desktop, "mouse");
      }
    } finally {
      await close(page);
    }
  }, 90_000);

  it("calls a pane narrow only when its content box is 440 or less, fractions included", async () => {
    const page = await open({ width: 1440, pointer: "mouse" });
    try {
      const narrowAt = (width: number) => page.evaluate((width) => window.assetsPage.narrowAt(width), width);
      expect(await narrowAt(476.25)).toBe(false);
      expect(await narrowAt(476.5)).toBe(false);
      expect(await narrowAt(476)).toBe(true);
      expect(await narrowAt(475.75)).toBe(true);
      expect(await narrowAt(400)).toBe(true);
    } finally {
      await close(page);
    }
  }, 60_000);

  it.each(SIZES)("paints its first frame in a 400 pane with the pane's columns, so nothing jumps, in %s", async (size) => {
    const page = await open({
      width: 1440,
      pointer: "mouse",
      pictures: 60,
      pane: 400,
      lists: { assetsLayouts: { "Assets/Images/Cast": { "Portrait tiles": "portrait", "Landscape tiles": "landscape", "Small tiles": "small" }[size] } },
    });
    try {
      await frames(page);
      const first = await page.evaluate(() => window.assetsPage.firstFrame);
      const settled = await page.evaluate(() => window.assetsPage.grid());
      expect(first).toEqual(settled);
      expect(first!.list).toBe(true);
      const { columns } = await checkGeometry(page, size, GRIDS.pane, "mouse");
      expect(first!.columns).toBe(columns);
    } finally {
      await close(page);
    }
  }, 60_000);

  it.each(SIZES)("reaches every tile by Tab, in the list's order, in %s", async (size) => {
    const page = await open({ width: 1440, pointer: "mouse", pictures: 6 });
    try {
      await choose(page, size, "mouse");
      const order = await page.evaluate(() =>
        [...document.querySelectorAll('[role="list"] button[aria-label^="Open"]')].map((button) => button.getAttribute("aria-label")),
      );
      expect(order.length).toBe(7);
      await page.locator('[data-assets-action="layout"]').focus();
      const reached: string[] = [];
      for (let press = 0; press < 40 && reached.length < order.length; press += 1) {
        await page.keyboard.press("Tab");
        const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
        if (label.startsWith("Open")) reached.push(label);
      }
      expect(reached).toEqual(order);
    } finally {
      await close(page);
    }
  }, 60_000);

  it("fits a wide picture to a Portrait tile's height, centred, and letterboxes every picture in Landscape and Small tiles", async () => {
    const page = await open({ width: 1440, pointer: "mouse" });
    try {
      await choose(page, "Portrait tiles", "mouse");
      await page.waitForFunction(() => [...document.querySelectorAll('[role="list"] img')].every((image) => (image as HTMLImageElement).complete));
      let fits = await pictureFit(page);
      for (const name of ["picture_000", "picture_001", "picture_002"]) {
        const fit = fits[name]!;
        expect(fit.height).toBeCloseTo(fit.mediaHeight, 1);
        expect(fit.centre).toBeCloseTo(fit.mediaCentre, 1);
      }
      expect(fits.picture_000!.width).toBeCloseTo((fits.picture_000!.mediaHeight * 300) / 400, 0);
      expect(fits.picture_002!.width).toBeGreaterThan(fits.picture_002!.mediaWidth);
      for (const size of ["Landscape tiles", "Small tiles"] as const) {
        await choose(page, size, "mouse");
        fits = await pictureFit(page);
        for (const name of ["picture_000", "picture_001", "picture_002"]) {
          const fit = fits[name]!;
          expect(fit.fit).toBe("contain");
          expect(fit.width).toBeCloseTo(fit.mediaWidth, 1);
          expect(fit.height).toBeCloseTo(fit.mediaHeight, 1);
        }
      }
    } finally {
      await close(page);
    }
  }, 60_000);

  it.each([
    { width: 1440, height: 900, pointer: "mouse" as const },
    { width: 820, height: 1180, pointer: "mouse" as const },
    { width: 430, height: 932, pointer: "touch" as const },
  ])("keeps the asset at the top of the view there, and moves nothing but the grid, when the size changes at $width", async ({ width, height, pointer }) => {
    const page = await open({ width, height, pointer, pictures: 120 });
    try {
      await choose(page, "Portrait tiles", pointer);
      const chrome = () =>
        page.evaluate(() =>
          ['input[type="search"]', 'nav[aria-label="Folder path"]', '[data-assets-action="layout"]', '[role="tablist"]'].map((selector) => {
            const rect = document.querySelector(selector)!.getBoundingClientRect();
            return [selector, rect.left, rect.top, rect.width, rect.height];
          }),
        );
      const topItem = () =>
        page.evaluate(() => {
          const list = document.querySelector<HTMLElement>('[role="list"]')!;
          const view = list.parentElement!.getBoundingClientRect().top;
          const cells = [...list.querySelectorAll<HTMLElement>('[role="listitem"]')]
            .map((cell) => ({ index: Number(cell.getAttribute("aria-posinset")) - 1, top: cell.getBoundingClientRect().top - view }))
            .filter((cell) => cell.top > -1)
            .sort((a, b) => a.top - b.top || a.index - b.index);
          return cells[0]!;
        });
      const before = await chrome();
      await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('[role="list"]')!;
        const tops = [...list.querySelectorAll<HTMLElement>('[role="listitem"]')].map((item) => parseFloat(item.style.top));
        const lines = [...new Set(tops)].sort((a, b) => a - b);
        const columns = tops.filter((top) => top === lines[0]).length;
        list.parentElement!.scrollTop = list.offsetTop + Math.floor(30 / columns) * (lines[1]! - lines[0]!);
      });
      await frames(page);
      let previous = await topItem();
      expect(Math.abs(previous.top)).toBeLessThan(1);
      expect(previous.index).toBe(30 - (30 % (await grid(page)).columns));
      for (const size of ["Small tiles", "Landscape tiles", "Portrait tiles", "List"] as const) {
        await choose(page, size, pointer);
        await frames(page);
        const now = await topItem();
        expect(Math.abs(now.top), size).toBeLessThan(1);
        const columns = size === "List" ? 1 : (await grid(page)).columns;
        expect(now.index, size).toBe(previous.index - (previous.index % columns));
        expect(await chrome(), size).toEqual(before);
        previous = now;
      }
    } finally {
      await close(page);
    }
  }, 90_000);
});
