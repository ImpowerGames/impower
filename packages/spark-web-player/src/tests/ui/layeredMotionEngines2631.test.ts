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

const GROUP_CASES: [string, Record<string, string>][] = [
  ["a faded label holding two overlapping files", { opacity: "50%" }],
  ["a faded and moved label holding two overlapping files", { opacity: "50%", translate: "20px 12px" }],
];

const CORRUPT_WEBP =
  "data:image/webp;base64,UklGRkwAAABXRUJQVlA4IEAAAABwAwCdASog/////////////yIhKAgAgA2JZQDKLoB+AABBlBAA/vCbQ//ILlhdcjX/8gP+QH/ID/+PfYwoMAAA";

const CUT_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAYAAABe3VzdAAAAPUlEQVRYR+3QMQ0AMAzAsJY/6A2Enx4=";

const SVG_LAYER_CASES: [string, Record<string, string>, Record<string, string>][] = [
  ["movements that cancel", { translate: "-40px 0" }, { translate: "40px 0" }],
  ["a turn around a nested move", { rotate: "90deg", transform_origin: "50px 50px" }, { translate: "20px -10px" }],
  ["a move inside a faded label", { opacity: "50%", translate: "10px 10px" }, { opacity: "50%", translate: "20px -10px" }],
  ["a move past the picture's edge", { translate: "40px 0" }, { translate: "20px 0" }],
];

const SVG_LAYER_SIZES: [number, number][] = [
  [200, 200],
  [200, 150],
  [100, 200],
];

const SVG_LAYER_ALLOWANCE = 0.02;

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

type Harness = Record<"show" | "showGroup", (moved: unknown, progress: number) => Promise<void>> & {
  load(src: string): Promise<{ accepted: boolean; painted: number }>;
  sparse(dot: number): Promise<boolean>;
  svgLayer(outer: Record<string, string>, inner: Record<string, string>, width: number, height: number, sibling?: boolean): Promise<void>;
  cssFit(kind: string, width: number, height: number): Promise<void>;
  wholePng: string;
};


async function differing(page: Page, moved: Record<string, string>, progress: number, picture: "show" | "showGroup" = "show") {
  await page.evaluate(({ moved, progress, picture }) => (window as unknown as { layeredMotion: Harness }).layeredMotion[picture](moved, progress), { moved, progress, picture });
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
  let groupRest = 0;
  let groupStill: Buffer;

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
    ({ share: groupRest, ours: groupStill } = await differing(page, GROUP_CASES[0]![1], 0, "showGroup"));
    console.log(`${name}: ${(groupRest * 100).toFixed(3)}% of the grouped picture's pixels differ with nothing faded`);
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

  test.for(GROUP_CASES)("%s is composited before it fades, at half and full progress", async ([label, moved], context) => {
    if (!browser) return context.skip();
    for (const progress of [0.5, 1]) {
      const drawn = await differing(page, moved, progress, "showGroup");
      console.log(`${name}: ${label} at ${progress}: ${(drawn.share * 100).toFixed(3)}%`);
      expect(share(drawn.ours, groupStill)).toBeGreaterThan(0.01);
      expect(drawn.share).toBeLessThanOrEqual(groupRest + ALLOWANCE);
    }
  });

  test("a corrupt or truncated file is not loaded, and a whole one loads and draws", async (context) => {
    if (!browser) return context.skip();
    const whole = await page.evaluate(() => (window as unknown as { layeredMotion: Harness }).layeredMotion.wholePng);
    const bytes = Buffer.from(whole.slice(whole.indexOf(",") + 1), "base64");
    const truncated = `data:image/png;base64,${bytes.subarray(0, Math.floor(bytes.length / 2)).toString("base64")}`;
    const [corrupt, half, cut, full] = await page.evaluate(
      (sources) => Promise.all(sources.map((src) => (window as unknown as { layeredMotion: Harness }).layeredMotion.load(src))),
      [CORRUPT_WEBP, truncated, CUT_PNG, whole],
    );
    console.log(`${name}: corrupt ${JSON.stringify(corrupt)}, half ${JSON.stringify(half)}, cut ${JSON.stringify(cut)}, whole ${JSON.stringify(full)}`);
    expect(corrupt!.accepted).toBe(false);
    expect(half!.accepted).toBe(false);
    expect(cut!.accepted).toBe(false);
    expect(full).toMatchObject({ accepted: true, painted: 40 * 30 });
  });

  test.for(SVG_LAYER_CASES)(
    "an SVG layer drawn as its own live view matches it drawn before it is live, and both match the browser at a uniform placement: %s",
    async ([label, outer, inner], context) => {
      if (!browser) return context.skip();
      for (const sibling of [false, true]) {
        for (const [width, height] of SVG_LAYER_SIZES) {
          await page.evaluate(
            ({ outer, inner, width, height, sibling }) =>
              (window as unknown as { layeredMotion: Harness }).layeredMotion.svgLayer(outer, inner, width, height, sibling),
            { outer, inner, width, height, sibling },
          );
          const live = await pixels(page, "#live");
          const drawn = await pixels(page, "#canvas");
          const differ = share(live.data, drawn.data);
          const where = `${sibling ? "beside" : "inside"} the inner label at ${width}x${height}`;
          console.log(`${name}: SVG layer ${label}, ${where}: live vs before live ${(differ * 100).toFixed(3)}%`);
          expect(differ).toBeLessThanOrEqual(SVG_LAYER_ALLOWANCE);
          if (width !== height) continue;
          const reference = await pixels(page, "#reference");
          const fromLive = share(live.data, reference.data);
          const fromDrawn = share(drawn.data, reference.data);
          console.log(`${name}: SVG layer ${label}, ${where}: against the browser ${(fromLive * 100).toFixed(3)}% live, ${(fromDrawn * 100).toFixed(3)}% before live`);
          expect(fromLive).toBeLessThanOrEqual(SVG_LAYER_ALLOWANCE);
          expect(fromDrawn).toBeLessThanOrEqual(SVG_LAYER_ALLOWANCE);
        }
      }
    },
  );

  test.for(["a viewBox of another shape", "no viewBox", "an alignment and slice"])(
    "an SVG layer file with %s is drawn in the picture as CSS draws it, at uniform and stretched placements",
    async (kind, context) => {
      if (!browser) return context.skip();
      for (const [width, height] of SVG_LAYER_SIZES) {
        await page.evaluate(
          ({ kind, width, height }) => (window as unknown as { layeredMotion: Harness }).layeredMotion.cssFit(kind, width, height),
          { kind, width, height },
        );
        const ours = await pixels(page, "#ours");
        const css = await pixels(page, "#css");
        const differ = share(ours.data, css.data);
        console.log(`${name}: SVG file with ${kind} at ${width}x${height}: ${(differ * 100).toFixed(3)}% from CSS`);
        expect(differ).toBeLessThanOrEqual(SVG_LAYER_ALLOWANCE);
      }
    },
  );

  test("the paint probe finds a single painted pixel on a large layer, and nothing on an empty one", async (context) => {
    if (!browser) return context.skip();
    const [dot, empty] = await page.evaluate(() =>
      Promise.all([1, 0].map((dot) => (window as unknown as { layeredMotion: Harness }).layeredMotion.sparse(dot))),
    );
    expect(dot).toBe(true);
    expect(empty).toBe(false);
  });
});
