// @vitest-environment node
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const ENGINES: [string, BrowserType, "required" | "when installed"][] = [
  ["chromium", chromium, "required"],
  ["webkit", webkit, "when installed"],
  ["firefox", firefox, "when installed"],
];

const BOX = { width: 736, height: 552 };
const SCALES = [1, 2];
const LEVELS = 8;
const SAME = 0.0005;
const RECORDED: Record<string, number[]> = { chromium: [0.005, 0.0041], webkit: [0.00024, 0.00012], firefox: [0.00017, 0.00013] };
const MARGIN = 0.002;

let outDir: string;
let pageUrl: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "outline-engines-"));
  await build({
    entryPoints: [resolve(__dirname, "harness/outlinePage.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "page.js"),
    loader: { ".svg": "text", ".css": "text", ".html": "text", ".yaml": "text", ".sd": "text", ".luau": "text" },
    logLevel: "silent",
  });
  const page = join(outDir, "page.html");
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><script src="page.js"></script></body>`);
  pageUrl = pathToFileURL(page).href;
}, 120_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function pixels(page: Page, selector: string) {
  const png = await page.locator(selector).screenshot();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const share = (a: Buffer, b: Buffer) => {
  let over = 0;
  for (let i = 0; i < a.length; i += 4) if ([0, 1, 2, 3].some((c) => Math.abs(a[i + c]! - b[i + c]!) > LEVELS)) over += 1;
  return over / (a.length / 4);
};

describe.each(ENGINES)("in %s, a shadow outline encoded in a worker where the engine can, and with toBlob where it cannot, matches the page's toBlob encoding and the CSS SVG mask (#2812)", (name, engine, need) => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    try {
      browser = await engine.launch();
    } catch (error) {
      if (need === "required") throw error;
      console.log(`${name}: not installed here, so its comparison is skipped`);
    }
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  test.for(SCALES)("at %ix pixel density", { timeout: 60_000 }, async (scale, context) => {
    if (!browser) return context.skip();
    const page = await (await browser.newContext({ viewport: { width: 2300, height: 700 }, deviceScaleFactor: scale })).newPage();
    page.on("pageerror", (error) => console.error(`${name}: ${error.message}`));
    await page.goto(pageUrl);
    await page.waitForFunction(() => "outlines" in window);
    const route = await page.evaluate(
      ({ width, height }) => (window as unknown as { outlines: { show(w: number, h: number): Promise<{ capable: boolean; offThread: boolean; pageEncodes: number }> } }).outlines.show(width, height),
      BOX,
    );
    const worker = await pixels(page, "#worker");
    const paged = await pixels(page, "#page");
    const css = await pixels(page, "#css");
    const sameAsPage = share(worker.data, paged.data);
    const fromCss = share(worker.data, css.data);
    console.log(
      `${name} ${scale}x: OffscreenCanvas and createImageBitmap ${route.capable ? "present" : "absent"}, worker route ${route.offThread}, page toBlob calls during it ${route.pageEncodes}; worker vs page encoding ${(sameAsPage * 100).toFixed(3)}%, worker vs CSS SVG mask ${(fromCss * 100).toFixed(3)}% of pixels over ${LEVELS} levels`,
    );
    expect(route.offThread).toBe(route.capable);
    expect(route.pageEncodes).toBe(route.capable ? 0 : 1);
    expect(sameAsPage).toBeLessThanOrEqual(SAME);
    expect(fromCss).toBeLessThanOrEqual(RECORDED[name]![scale - 1]! + MARGIN);
    await page.close();
  });
});
