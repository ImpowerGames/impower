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
  mismatch: number;
  width: number;
  height: number;
  unsettled: number;
  opacity: number;
  reflowed: number;
  twinMedia: [string | null, number];
  realWidth: number;
  animations: number;
  kept: number;
  restarted: number;
  transitions: number;
  focused: boolean;
  scroll: [number, number];
  media: string[];
  mutations: number;
  unchanged: boolean;
  left: boolean;
}

let outDir: string;
let pageUrl: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "replica-"));
  await build({
    entryPoints: [resolve(__dirname, "harness/replicaPage.ts")],
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

const measure = (page: Page, scoped: boolean) =>
  page.evaluate((scoped) => (window as unknown as { replicaProbe: { measure(scoped: boolean): Promise<Measured> } }).replicaProbe.measure(scoped), scoped);

describe.each(ENGINES)("in %s, a beat is measured on a replica of the stage, which leaves the shown stage untouched (#2837)", (name, engine, need) => {
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
    await page.waitForFunction(() => "replicaProbe" in window);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  test.for([false, true])("the replica lays out exactly as the stage (beside its scope element: %s), and a removal, a selector that sees it and a text reflow measured there come out as applied", async (scoped, context) => {
    if (!browser) return context.skip();
    const result = await measure(page, scoped);
    console.log(`${name} ${scoped ? "scoped" : "beside"}: ${JSON.stringify(result)}`);
    expect(result.mismatch).toBeLessThan(0.01);
    expect(result.width).toBe(400);
    expect(result.height).toBe(30);
    expect(result.opacity).toBe(1);
    expect(result.reflowed).toBeGreaterThan(0);
    expect(result.twinMedia).toEqual([null, 0]);
    expect(result.realWidth).toBe(300);
  });

  test("the copy's stylesheets are rewritten so that every rule they keep applies only inside the copy", async (context) => {
    if (!browser) return context.skip();
    const css = await page.evaluate(() => (window as unknown as { replicaProbe: { rewrite(): string } }).replicaProbe.rewrite());
    console.log(`${name}: rewrite ${JSON.stringify(css)}`);
    expect(css).toContain("spark-web-player [data-probe] .card, spark-web-player [data-probe] .badge:is(.a, .b)");
    expect(css).toContain("spark-web-player [data-probe] {");
    expect(css).toContain("spark-web-player [data-probe] .plate > .image");
    expect(css).toContain("@keyframes probe-pulse");
    expect(css).not.toContain("@property");
    expect(css).not.toContain("@font-face");
    expect(css.split("\n").filter((line) => line.trimStart().startsWith(".")).length).toBe(0);
  });

  test.for([false, true])("the stage's animations, transitions, focus, scroll position, media and markup are left as they were (beside its scope element: %s)", async (scoped, context) => {
    if (!browser) return context.skip();
    const result = await measure(page, scoped);
    expect(result.animations).toBeGreaterThanOrEqual(4);
    expect(result.transitions).toBeGreaterThanOrEqual(1);
    expect(result.kept).toBe(result.animations);
    expect(result.restarted).toBe(0);
    expect(result.focused).toBe(true);
    expect(result.scroll[0]).toBeGreaterThan(0);
    expect(result.scroll[1]).toBe(result.scroll[0]);
    expect(result.media).toEqual([]);
    expect(result.mutations).toBe(0);
    expect(result.unchanged).toBe(true);
    expect(result.left).toBe(true);
  });
});
