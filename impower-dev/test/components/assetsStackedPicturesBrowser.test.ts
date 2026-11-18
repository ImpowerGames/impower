// @vitest-environment node
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundlePage, frames, layoutOf, stylesFor } from "./pageBundle";

type View = "Portrait tiles" | "Landscape tiles" | "Small tiles" | "List";

const SQUARE = { left: 100, top: 150, right: 200, bottom: 250, width: 300, height: 400 };

const IMANI = "Assets/Images/Portraits/imani.png";
const BUNNY = "Assets/Images/Portraits/bunny.png";

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  script = await bundlePage("test/components/assetsStackedPicturesPage.tsx", "test/components/assetsStackedPicturesWorkspace.ts");
  css = await stylesFor(script);
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

const open = async ({ folder, crowd, width = 1440, height = 900 }: { folder: string; crowd?: number; width?: number; height?: number }) => {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.route("https://page.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html data-theme="charcoal" data-layout="${layoutOf(width)}" data-pointer="fine"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0"></body></html>`,
    }),
  );
  await page.goto("https://page.test/");
  await page.addScriptTag({ content: script });
  await page.evaluate((setup) => window.stackedPage.mount(setup), { folder, crowd });
  await page.locator("[data-asset-path]").first().waitFor();
  return page;
};

const choose = async (page: Page, view: View) => {
  await page.locator('[data-assets-action="layout"]').first().click();
  await page.locator(`[role="menuitemradio"]:has-text("${view}")`).first().click();
  await page.locator('[role="menuitemradio"]').first().waitFor({ state: "detached" });
  await frames(page);
};

const pictureOf = (page: Page, path: string) => page.locator(`[data-asset-path="${path}"] img`).first();

const composed = async (page: Page, path: string) => {
  await page.waitForFunction(
    ([at, base]) => {
      const image = document.querySelector<HTMLImageElement>(`[data-asset-path="${at}"] img`);
      return !!image && image.src !== base && image.complete && image.naturalWidth > 0;
    },
    [path, await page.evaluate((at) => window.stackedPage.bases[at]!, path)] as const,
    { timeout: 8_000 },
  ).catch(() => undefined);
  await frames(page);
};

const points = (page: Page, selector: string, at: readonly (readonly [number, number])[]) =>
  page.evaluate(
    ({ selector, at }) => {
      const image = document.querySelector<HTMLImageElement>(selector)!;
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      const [px, py] = style.objectPosition.split(" ").map((part) => parseFloat(part) / 100);
      const fit = style.objectFit;
      const scale =
        fit === "contain"
          ? Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
          : fit === "cover"
            ? Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
            : null;
      const drawn = scale ? { width: image.naturalWidth * scale, height: image.naturalHeight * scale } : rect;
      const left = rect.left + (rect.width - drawn.width) * (scale ? px! : 0);
      const top = rect.top + (rect.height - drawn.height) * (scale ? py! : 0);
      return at.map(([x, y]) => ({ x: left + x * drawn.width, y: top + y * drawn.height }));
    },
    { selector, at },
  );

const colours = async (page: Page, selector: string, at: readonly (readonly [number, number])[]) => {
  const where = await points(page, selector, at);
  const shot = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true });
  return where.map(({ x, y }) => {
    const offset = (Math.round(y) * shot.info.width + Math.round(x)) * shot.info.channels;
    const [r, g, b] = [shot.data[offset]!, shot.data[offset + 1]!, shot.data[offset + 2]!];
    return r > 160 && g < 90 && b < 90 ? "layer" : b > 140 && r < 90 ? "base" : r < 50 && g < 50 && b < 50 ? "bare" : `rgb(${r},${g},${b})`;
  });
};

const fraction = (x: number, y: number) => [x / SQUARE.width, y / SQUARE.height] as const;

const INSIDE = [
  fraction(SQUARE.left + 12, (SQUARE.top + SQUARE.bottom) / 2),
  fraction(SQUARE.right - 12, (SQUARE.top + SQUARE.bottom) / 2),
  fraction((SQUARE.left + SQUARE.right) / 2, SQUARE.top + 12),
  fraction((SQUARE.left + SQUARE.right) / 2, SQUARE.bottom - 12),
];

const OUTSIDE = [
  fraction(SQUARE.left - 12, (SQUARE.top + SQUARE.bottom) / 2),
  fraction(SQUARE.right + 12, (SQUARE.top + SQUARE.bottom) / 2),
  fraction((SQUARE.left + SQUARE.right) / 2, SQUARE.top - 12),
  fraction((SQUARE.left + SQUARE.right) / 2, SQUARE.bottom + 12),
];

const CENTRE = [fraction((SQUARE.left + SQUARE.right) / 2, (SQUARE.top + SQUARE.bottom) / 2)];

describe("a stacked picture on the Assets page", () => {
  for (const view of ["Portrait tiles", "Landscape tiles", "Small tiles"] as const) {
    it(`draws its default layer over its base on the tile, registered at the base's edges, in ${view}`, async () => {
      const page = await open({ folder: "Assets/Images/Portraits" });
      await choose(page, view);
      await composed(page, IMANI);
      const selector = `[data-asset-path="${IMANI}"] img`;
      expect(await colours(page, selector, CENTRE)).toEqual(["layer"]);
      expect(await colours(page, selector, INSIDE)).toEqual(["layer", "layer", "layer", "layer"]);
      expect(await colours(page, selector, OUTSIDE)).toEqual(["base", "base", "base", "base"]);
      expect(await page.locator(`[data-asset-path="${IMANI}"] img`).count()).toBe(1);
      await page.context().close();
    }, 30_000);
  }

  it("draws its default layer on its List thumbnail", async () => {
    const page = await open({ folder: "Assets/Images/Portraits" });
    await choose(page, "List");
    await composed(page, IMANI);
    expect(await colours(page, `[data-asset-path="${IMANI}"] img`, CENTRE)).toEqual(["layer"]);
    await page.context().close();
  }, 30_000);

  it("asks for the resting picture the inspector shows, and leaves a plain picture's tile on its own file", async () => {
    const page = await open({ folder: "Assets/Images/Portraits" });
    await composed(page, IMANI);
    const requests = await page.evaluate(() => window.pictureRequests.map(({ uri, variant }) => ({ uri, variant })));
    expect(requests).toEqual([{ uri: `file:///p/${IMANI}`, variant: { image: "imani", attributes: [] } }]);
    expect(await pictureOf(page, BUNNY).getAttribute("src")).toBe(await page.evaluate((at) => window.stackedPage.bases[at], BUNNY));
    await page.context().close();
  }, 30_000);

  it("draws its default layer in a folder cover cell, the same picture as its tile", async () => {
    const page = await open({ folder: "Assets/Images" });
    const cover = '[data-asset-path="Assets/Images/Portraits"] [data-folder-cover] [data-thumbnail]';
    const base = await page.evaluate((at) => window.stackedPage.bases[at]!, IMANI);
    const bunny = await page.evaluate((at) => window.stackedPage.bases[at]!, BUNNY);
    await page.waitForFunction(
      ([selector, plain, bare]) =>
        [...document.querySelectorAll<HTMLImageElement>(`${selector} img`)].some(
          (image) => image.src !== plain && image.src !== bare && image.complete && image.naturalWidth > 0,
        ),
      [cover, bunny, base] as const,
      { timeout: 8_000 },
    ).catch(() => undefined);
    await frames(page);
    const cells = await page.locator(`${cover} img`).evaluateAll((images, plain) => images.map((image) => (image as HTMLImageElement).src !== plain), bunny);
    const index = cells.indexOf(true);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(await colours(page, `${cover}:nth-child(${index + 1}) img`, CENTRE)).toEqual(["layer"]);
    await page.context().close();
  }, 30_000);
});

describe("a folder of many stacked pictures", () => {
  it("asks only for the tiles the list has mounted, and for the next ones as they scroll into view", async () => {
    const page = await open({ folder: "Assets/Images/Crowd", crowd: 200 });
    await choose(page, "Portrait tiles");
    await composed(page, "Assets/Images/Crowd/person_000.png");
    await page.waitForTimeout(500);
    const mounted = () => page.evaluate(() => [...document.querySelectorAll("[data-asset-path]")].map((tile) => tile.getAttribute("data-asset-path")!));
    const asked = () => page.evaluate(() => window.pictureRequests.map(({ uri }) => uri.slice("file:///p/".length)));
    const top = await mounted();
    const first = await asked();
    expect(top.length).toBeLessThan(200);
    expect(first.length).toBe(top.length);
    expect(first.every((path) => top.includes(path))).toBe(true);
    await page.locator('[role="list"]').evaluate((list) => {
      list.parentElement!.scrollTop = list.scrollHeight;
    });
    await composed(page, "Assets/Images/Crowd/person_199.png");
    await page.waitForTimeout(500);
    const bottom = await mounted();
    const all = await asked();
    expect(all.every((path) => top.includes(path) || bottom.includes(path))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("Assets/Images/Crowd/person_100.png");
    await page.context().close();
  }, 30_000);
});
