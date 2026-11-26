// @vitest-environment node
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const POSES: [string, Record<string, number>][] = [
  ["the mouth showing teeth", { talk: 0.25 }],
  ["the mouth open", { talk: 0.5 }],
  ["the eyes closed, with the brows and accessories moved", { blink: 0.5 }],
  ["the eyes and the moved layers halfway", { blink: 0.25 }],
  ["the mouth open while the eyes close", { talk: 0.5, blink: 0.5 }],
];

const SCALES = [1, 2];
const BOX = { width: 400, height: 300 };
const LEVELS = 8;
const ALLOWANCE = 0.02;
const POSE_ALLOWANCE = 0.1;
const SHOTS = process.env["MORPH_POSE_SHOTS"];

let outDir: string;
let pageUrl: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "morph-poses-"));
  await build({
    entryPoints: [resolve(__dirname, "harness/morphPosePage.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "page.js"),
    loader: { ".svg": "text", ".css": "text", ".html": "text", ".yaml": "text", ".sd": "text", ".luau": "text" },
    logLevel: "silent",
  });
  const page = join(outDir, "page.html");
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><script src="page.js"></script></body>`);
  pageUrl = pathToFileURL(page).href;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}, 120_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

async function pixels(page: Page, selector: string, shot?: string) {
  const png = await page.locator(selector).screenshot();
  if (shot) writeFileSync(shot, png);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const apart = (a: Buffer, b: Buffer, i: number) => [0, 1, 2, 3].some((c) => Math.abs(a[i + c]! - b[i + c]!) > LEVELS);

const share = (a: Buffer, b: Buffer) => {
  let over = 0;
  for (let i = 0; i < a.length; i += 4) if (apart(a, b, i)) over += 1;
  return over / (a.length / 4);
};

const posed = (live: Buffer, drawn: Buffer, rest: Buffer) => {
  let changed = 0;
  let missed = 0;
  for (let i = 0; i < live.length; i += 4) {
    if (!apart(live, rest, i)) continue;
    changed += 1;
    if (apart(live, drawn, i)) missed += 1;
  }
  return { changed: changed / (live.length / 4), missed: changed ? missed / changed : 1 };
};

describe.each(ENGINES)("in %s, a drawn portrait's pose drawn as a frame matches the same pose drawn as live SVG, its layers moved by Web Animations (#2812)", (name, engine, need) => {
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

  test.for(SCALES)("at %ix pixel density, every pose differs from its live drawing by at most the allowance, and draws the pixels the pose changes from the rest as the live drawing does", { timeout: 90_000 }, async (scale, context) => {
    if (!browser) return context.skip();
    const page = await (await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: scale })).newPage();
    page.on("pageerror", (error) => console.error(`${name}: ${error.message}`));
    await page.goto(pageUrl);
    await page.waitForFunction(() => "morphPoses" in window);
    const showPose = (offsets: Record<string, number>) =>
      page.evaluate(
        ({ offsets, width, height }) => (window as unknown as { morphPoses: { show(o: unknown, w: number, h: number): Promise<number> } }).morphPoses.show(offsets, width, height),
        { offsets, width: BOX.width, height: BOX.height },
      );
    await showPose({});
    const rest = await pixels(page, "#live");
    for (const [label, offsets] of POSES) {
      await page.evaluate(
        ({ offsets, width, height }) => (window as unknown as { morphPoses: { show(o: unknown, w: number, h: number): Promise<number> } }).morphPoses.show(offsets, width, height),
        { offsets, width: BOX.width, height: BOX.height },
      );
      const tag = SHOTS ? join(SHOTS, `${name}-${scale}x-${label.replace(/[^a-z]+/g, "-")}`) : undefined;
      const live = await pixels(page, "#live", tag && `${tag}-live.png`);
      const drawn = await pixels(page, "#drawn", tag && `${tag}-drawn.png`);
      expect([drawn.width, drawn.height]).toEqual([live.width, live.height]);
      const differ = share(live.data, drawn.data);
      const pose = posed(live.data, drawn.data, rest.data);
      console.log(
        `${name}: ${label} at ${scale}x: ${(differ * 100).toFixed(3)}% of pixels differ by more than ${LEVELS} levels from its live drawing; of the ${(pose.changed * 100).toFixed(3)}% the pose changes from the rest, ${(pose.missed * 100).toFixed(2)}% differ`,
      );
      expect(differ).toBeLessThanOrEqual(ALLOWANCE);
      expect(pose.changed).toBeGreaterThan(0.001);
      expect(pose.missed).toBeLessThanOrEqual(POSE_ALLOWANCE);
    }
    await page.close();
  });
});
