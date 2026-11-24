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

const CASES: [string, Record<string, string>][] = [
  ["translate, rotate and scale together", { translate: "24px -16px", rotate: "5deg", scale: "1.05" }],
  ["a transform list", { transform: "rotate(-4deg) translate(20px, 12px) scale(0.95)" }],
  ["a percentage translate", { translate: "5% -3%" }],
  ["an origin away from the centre", { rotate: "8deg", transform_origin: "60px 90px" }],
];

const LEVELS = 8;
const ALLOWANCE = 0.001;

let outDir: string;
let pageUrl: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "layered-motion-"));
  await build({
    entryPoints: [resolve(__dirname, "harness/layeredMotionPage.ts")],
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
  for (let i = 0; i < a.length; i += 4) {
    if ([0, 1, 2, 3].some((c) => Math.abs(a[i + c]! - b[i + c]!) > LEVELS)) over += 1;
  }
  return over / (a.length / 4);
};

async function differing(page: Page, moved: Record<string, string>, progress: number) {
  await page.evaluate(
    ({ moved, progress }) => (window as unknown as { layeredMotion: { show(m: unknown, p: number): Promise<void> } }).layeredMotion.show(moved, progress),
    { moved, progress },
  );
  const ours = await pixels(page, "#ours");
  const theirs = await pixels(page, "#theirs");
  expect([ours.width, ours.height]).toEqual([theirs.width, theirs.height]);
  return { share: share(ours.data, theirs.data), ours: ours.data };
}

describe.each(ENGINES)("in %s, a moved image-file layer drawn on the canvas matches the browser moving it as SVG (#2631)", (name, engine, need) => {
  let browser: Browser | undefined;
  let page: Page;
  let rest = 0;
  let still: Buffer;

  beforeAll(async () => {
    try {
      browser = await engine.launch();
    } catch (error) {
      if (need === "required") throw error;
      console.log(`${name}: not installed here, so its comparison is skipped`);
      return;
    }
    const context = await browser.newContext({ viewport: { width: 480, height: 360 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.on("pageerror", (error) => console.error(`${name}: ${error.message}`));
    await page.goto(pageUrl);
    await page.waitForFunction(() => "layeredMotion" in window);
    ({ share: rest, ours: still } = await differing(page, CASES[0]![1], 0));
    console.log(`${name}: ${(rest * 100).toFixed(3)}% of pixels differ by more than ${LEVELS} levels with nothing moved`);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  test.for(CASES)("%s, at half and full progress", async ([label, moved], context) => {
    if (!browser) return context.skip();
    for (const progress of [0.5, 1]) {
      const drawn = await differing(page, moved, progress);
      console.log(`${name}: ${label} at ${progress}: ${(drawn.share * 100).toFixed(3)}%`);
      expect(share(drawn.ours, still)).toBeGreaterThan(0.01);
      expect(drawn.share).toBeLessThanOrEqual(rest + ALLOWANCE);
    }
  });
});
