// @vitest-environment node
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const ENGINES: [string, BrowserType, "required" | "when installed"][] = [
  ["chromium", chromium, "required"],
  ["webkit", webkit, "when installed"],
  ["firefox", firefox, "when installed"],
];

interface Measured {
  width: number;
  animations: number;
  kept: number;
  restarted: number;
  transitions: number;
  focused: boolean;
  scroll: [number, number];
  media: string[];
  connected: boolean;
  style: string | null;
}

let outDir: string;
let pageUrl: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "out-of-flow-"));
  await build({
    entryPoints: [resolve(__dirname, "harness/outOfFlowPage.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "page.js"),
    logLevel: "silent",
  });
  const page = join(outDir, "page.html");
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0"><script src="page.js"></script></body>`);
  pageUrl = pathToFileURL(page).href;
}, 120_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

interface Sibling {
  before: { scroll: number; width: number };
  during: { scroll: number; width: number };
  after: { scroll: number; width: number };
}

const sibling = (page: Page, kept: boolean) =>
  page.evaluate((kept) => (window as unknown as { outOfFlowProbe: { sibling(kept: boolean): Promise<Sibling> } }).outOfFlowProbe.sibling(kept), kept);

const measure = (page: Page, kind: "out-of-flow" | "detached") =>
  page.evaluate((kind) => (window as unknown as { outOfFlowProbe: { measure(kind: string): Promise<Measured> } }).outOfFlowProbe.measure(kind), kind);

describe.each(ENGINES)("in %s, an element a beat removes is taken out of flow, not out of the document, while the beat's layout is measured (#2810)", (name, engine, need) => {
  let browser: Browser | undefined;
  let page: Page;

  beforeAll(async () => {
    try {
      browser = await engine.launch();
    } catch (error) {
      if (need === "required") throw error;
      console.log(`${name}: not installed here, so its check is skipped`);
      return;
    }
    page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
    page.on("pageerror", (error) => console.error(`${name}: ${error.message}`));
    await page.goto(pageUrl);
    await page.waitForFunction(() => "outOfFlowProbe" in window);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  test("its siblings lay out as if it were gone, and its own and its siblings' animations, transitions, focus, scroll position and media are left as they were", async (context) => {
    if (!browser) return context.skip();
    const result = await measure(page, "out-of-flow");
    console.log(`${name}: out of flow ${JSON.stringify(result)}`);
    expect(result.width).toBe(400);
    expect(result.animations).toBeGreaterThanOrEqual(4);
    expect(result.transitions).toBeGreaterThanOrEqual(1);
    expect(result.kept).toBe(result.animations);
    expect(result.restarted).toBe(0);
    expect(result.focused).toBe(true);
    expect(result.scroll[0]).toBeGreaterThan(0);
    expect(result.scroll[1]).toBe(result.scroll[0]);
    expect(result.media).toEqual([]);
    expect(result.connected).toBe(true);
    expect(result.style).toBeNull();
  });

  test("a sibling scrolled to the end of its text, which the temporary layout widens, gets its scroll position back", async (context) => {
    if (!browser) return context.skip();
    const result = await sibling(page, true);
    console.log(`${name}: sibling kept ${JSON.stringify(result)}`);
    expect(result.before.scroll).toBeGreaterThan(0);
    expect(result.during.width).toBe(400);
    expect(result.during.scroll).toBe(0);
    expect(result.after).toEqual(result.before);
  });

  test("without keeping scroll positions, that sibling is left at the start of its text", async (context) => {
    if (!browser) return context.skip();
    const result = await sibling(page, false);
    console.log(`${name}: sibling not kept ${JSON.stringify(result)}`);
    expect(result.after.width).toBe(result.before.width);
    expect(result.after.scroll).toBe(0);
  });

  test("taking it out of the document instead disturbs it or its sibling", async (context) => {
    if (!browser) return context.skip();
    const result = await measure(page, "detached");
    console.log(`${name}: detached ${JSON.stringify(result)}`);
    expect(result.width).toBe(400);
    expect(result.kept < result.animations || result.restarted > 0 || !result.focused || result.scroll[1] !== result.scroll[0]).toBe(true);
  });
});
