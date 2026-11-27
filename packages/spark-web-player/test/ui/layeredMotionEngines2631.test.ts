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

const SVG_ROOT = (attributes: string, inside = "") => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${inside}<rect x="10" y="20" width="70" height="50"/></svg>`;

const ALLOWED_ROOT_STYLES = [
  "width:100px",
  "height:100px",
  "fill:#c03030",
  "fill-opacity:0.5",
  "fill-rule:evenodd",
  "stroke:#2040e0",
  "stroke:#2040e0;stroke-opacity:0.5",
  "stroke:#2040e0;stroke-width:5",
  "stroke:#2040e0;stroke-linecap:round",
  "stroke:#2040e0;stroke-linejoin:round",
  "stroke:#2040e0;stroke-miterlimit:2",
  "stroke:#2040e0;stroke-dasharray:4 2",
  "stroke:#2040e0;stroke-dasharray:4 2;stroke-dashoffset:3",
  "opacity:0.5",
  "color:#30c030;fill:currentColor",
  "clip-rule:evenodd",
  "stroke:#2040e0;stroke-width:5;paint-order:stroke",
  "shape-rendering:crispEdges",
  "text-rendering:geometricPrecision",
  "image-rendering:pixelated",
  "color-interpolation:linearRGB",
  "color-interpolation-filters:sRGB",
  "stop-color:red",
  "stop-opacity:0.5",
  "flood-color:red",
  "flood-opacity:0.5",
  "lighting-color:red",
  "fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2",
  "width:100px;height:100px;/*",
  "width:100px;height:100px;fill:url(&quot;x",
];

const REFUSED_ROOT_STYLES = [
  "min-width:400px",
  "max-width:100px",
  "min-height:400px",
  "max-height:100px",
  "box-sizing:border-box;padding:20px",
  "border:20px solid red",
  "border:20px none red",
  "margin:4px",
  "display:block",
  "contain:paint",
  "writing-mode:vertical-rl",
  "overflow:visible",
  "aspect-ratio:2",
  "box-sizing:border-box",
  "transform:scale(0.5)",
  "position:absolute",
  "zoom:2",
  "--brand:red",
];

const SVG_RASTERS: [string, number, number, string][] = [
  [SVG_ROOT('width="100" height="100" viewBox="0 0 100 100"'), 200, 150, "rasterized"],
  [SVG_ROOT('width="100" height="100" viewBox="0 0 100 100"', "<style>svg[style] { padding: 20px; min-width: 400px }</style>"), 200, 150, "refused"],
  [SVG_ROOT('width="100" height="100" viewBox="0 0 100 100"', '<style>svg[width="200"] { padding: 20px }</style>'), 200, 150, "refused"],
  [SVG_ROOT('width="100" height="100" viewBox="0 0 100 100"', '<style>svg[width="200"] { padding: 20px }</style>'), 300, 150, "rasterized"],
];

const SVG_VERDICTS: [string, string, { width: number; height: number } | undefined][] = [
  [SVG_ROOT('viewBox="0 0 100 100"', '<style>rect { font-family: "/*" } @keyframes spin { to { opacity: 0 } } rect { animation: spin 1s infinite }</style>'), "animated", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>rect { fill: url(https://example.invalid/a/*) } rect { animation: spin 1s infinite }</style>"), "animated", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>/* @keyframes old { to { opacity: 0 } } */ @keyframes spin { to { opacity: 0 } } rect { animation-name: spin }</style>"), "animated", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>rect { anim\\61tion-name: spin }</style>"), "animated", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>/* rect { animation: spin 1s } */ rect { fill: blue }</style>"), "kept", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>@keyframes unused { to { opacity: 0 } }</style>"), "kept", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>rect { padding: 4px; border: 2px solid red }</style>"), "kept", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>:root { padding: 4px }</style>"), "styled", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>svg { max-width: 100px !important; max-height: 100px !important }</style>"), "styled", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>svg { width: 100px; height: 100px; fill: red }</style>"), "kept", undefined],
  [SVG_ROOT('viewBox="0 0 100 100" style="--brand:red"'), "styled:--brand", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>svg { @media all { padding: 20px; min-width: 400px } }</style>"), "styled", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>svg { &amp; { padding: 4px } }</style>"), "styled", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>rect { @media all { padding: 4px } &amp; { border: 1px solid } }</style>"), "kept", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', '<foreignObject><style xmlns="http://www.w3.org/1999/xhtml">svg { padding: 20px; min-width: 400px }</style></foreignObject>'), "styled", undefined],
  ['<?xml-stylesheet type="text/css" href="data:text/css,svg%7Bpadding:20px%7D"?>' + SVG_ROOT('viewBox="0 0 100 100"'), "styled", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', "<style>@font-face { font-family: Brand; src: local(Arial) } text { font-family: Brand }</style>"), "kept", undefined],
  [SVG_ROOT('viewBox="0 0 100 100" data-x="&amp;"', '<style><![CDATA[g { :is(&, [data-x="&"]) { padding: 20px; transform: scale(.5) } }]]></style>'), "styled", undefined],
  [SVG_ROOT('viewBox="0 0 100 100" data-x="&amp;"', '<style><![CDATA[rect { :is(&, [data-x="&"]) { padding: 20px } }]]></style>'), "styled", undefined],
  [SVG_ROOT('viewBox="0 0 100 100"', '<style>@import url("data:text/css,svg%7Bpadding%3A20px%7D");</style>'), "styled", undefined],
  ...ALLOWED_ROOT_STYLES.map((style): [string, string, undefined] => [SVG_ROOT(`viewBox="0 0 100 100" style="${style}"`), "kept", undefined]),
  ...REFUSED_ROOT_STYLES.map((style): [string, string, undefined] => [SVG_ROOT(`viewBox="0 0 100 100" style="${style}"`), "styled", undefined]),
  [SVG_ROOT('width="1e309" height="1e309"'), "unsized", undefined],
  [SVG_ROOT('width="1e39" height="1e39"'), "unsized", undefined],
  [SVG_ROOT('width="100" height="100"'), "unsized", { width: 300, height: 150 }],
  [SVG_ROOT('width="1in" height="0.5in"'), "kept", { width: 96, height: 48 }],
];

const LEVELS = 8;
const ALLOWANCE = 0.001;
const CANVAS_ALLOWANCE = 0.0001;
const MISPLACED = 2;
const MISPLACED_REFERENCE = 4;

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

type Harness = Record<"show" | "showGroup", (moved: unknown, progress: number, options?: { shift?: number; stillShift?: number }) => Promise<void>> & {
  load(src: string): Promise<{ accepted: boolean; painted: number }>;
  sparse(dot: number): Promise<boolean>;
  svgLayer(outer: Record<string, string>, inner: Record<string, string>, width: number, height: number, sibling?: boolean): Promise<void>;
  cssFit(kind: string, width: number, height: number): Promise<void>;
  svgVerdict(text: string, natural?: { width: number; height: number }): string;
  svgRaster(text: string, width: number, height: number): Promise<string>;
  wholePng: string;
};


async function differing(page: Page, moved: Record<string, string>, progress: number, picture: "show" | "showGroup" = "show", options: { shift?: number; stillShift?: number } = {}) {
  await page.evaluate(
    ({ moved, progress, picture, options }) => (window as unknown as { layeredMotion: Harness }).layeredMotion[picture](moved, progress, options),
    { moved, progress, picture, options },
  );
  const ours = await pixels(page, "#ours");
  const theirs = await pixels(page, "#theirs");
  expect([ours.width, ours.height]).toEqual([theirs.width, theirs.height]);
  return { share: share(ours.data, theirs.data), ours: ours.data };
}

async function independent(page: Page, moved: Record<string, string>, progress: number, options: { shift?: number; stillShift?: number } = {}) {
  const drawn = await differing(page, moved, progress, "show", options);
  const still = await pixels(page, "#still");
  const theirs = await pixels(page, "#theirs");
  expect([still.width, still.height]).toEqual([theirs.width, theirs.height]);
  return { ...drawn, baseline: share(still.data, theirs.data), canvas: share(drawn.ours, still.data) };
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
    const context = await browser.newContext({ viewport: { width: 720, height: 360 }, deviceScaleFactor: 1 });
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

  test.for(CASES)(
    "%s, at half and full progress, differs from the browser by at most the allowance more than the same pose held still on a plain canvas, and matches that still",
    async ([label, moved], context) => {
      if (!browser) return context.skip();
      for (const progress of [0.5, 1]) {
        const drawn = await independent(page, moved, progress);
        console.log(
          `${name}: ${label} at ${progress}: ${(drawn.share * 100).toFixed(3)}% moved, ${(drawn.baseline * 100).toFixed(3)}% held still, ${(drawn.canvas * 100).toFixed(3)}% from the still`,
        );
        expect(share(drawn.ours, still)).toBeGreaterThan(0.01);
        expect(drawn.share).toBeLessThanOrEqual(drawn.baseline + ALLOWANCE);
        expect(drawn.canvas).toBeLessThanOrEqual(CANVAS_ALLOWANCE);
      }
    },
  );

  test.for(CASES)("%s, against a still two picture pixels away, or a browser layer four pixels away, differs by more than either allowance", async ([label, moved], context) => {
    if (!browser) return context.skip();
    for (const progress of [0.5, 1]) {
      const still = await independent(page, moved, progress, { stillShift: MISPLACED });
      const held = await independent(page, moved, progress);
      const off = await independent(page, moved, progress, { shift: MISPLACED_REFERENCE });
      console.log(
        `${name}: ${label} at ${progress}: ${(still.canvas * 100).toFixed(3)}% from a still ${MISPLACED}px away, ${(off.share * 100).toFixed(3)}% from a browser layer ${MISPLACED_REFERENCE}px away against ${(held.baseline * 100).toFixed(3)}% held still`,
      );
      expect(still.canvas).toBeGreaterThan(CANVAS_ALLOWANCE);
      expect(off.share).toBeGreaterThan(held.baseline + ALLOWANCE);
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
    "an SVG layer drawn on the picture's canvas from its poses matches it drawn before its morph is live, and both match the browser at a uniform placement: %s",
    { timeout: 30_000 },
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

  test.for(["a viewBox of another shape", "no viewBox", "an alignment and slice", "a size set by its own style", "a size set by a stylesheet", ...ALLOWED_ROOT_STYLES])(
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

  test.for(SVG_VERDICTS)("the browser reads an SVG layer file %s as %s", async ([text, expected, natural], context) => {
    if (!browser) return context.skip();
    const verdict = await page.evaluate(
      ({ text, natural }) => (window as unknown as { layeredMotion: Harness }).layeredMotion.svgVerdict(text, natural),
      { text, natural },
    );
    if (expected === "styled") expect(verdict).toMatch(/^styled:/);
    else expect(verdict).toBe(expected);
  });

  test.for(SVG_RASTERS)("the rasterizer, fitting an SVG layer file %s to %i×%i, answers %s", async ([text, width, height, expected], context) => {
    if (!browser) return context.skip();
    const answer = await page.evaluate(
      ({ text, width, height }) => (window as unknown as { layeredMotion: Harness }).layeredMotion.svgRaster(text, width, height),
      { text, width, height },
    );
    expect(answer).toBe(expected);
  });

  test("the paint probe finds a single painted pixel on a large layer, and nothing on an empty one", async (context) => {
    if (!browser) return context.skip();
    const [dot, empty] = await page.evaluate(() =>
      Promise.all([1, 0].map((dot) => (window as unknown as { layeredMotion: Harness }).layeredMotion.sparse(dot))),
    );
    expect(dot).toBe(true);
    expect(empty).toBe(false);
  });
});
