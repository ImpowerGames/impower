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

interface Look {
  width: number;
  color: string;
}

interface Fallen {
  applied: number;
  waiting: boolean;
  veiled: boolean;
}

interface Removed {
  first: [number, number] | undefined;
  asked: [number, number][];
  waiting: boolean;
  applied: number;
  width: number;
}

let outDir: string;
let pageUrl: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "measured-beat-"));
  await build({
    entryPoints: [resolve(__dirname, "harness/measuredBeatPage.ts")],
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

const probe = <T>(page: Page, name: string, flag: boolean | string = false) =>
  page.evaluate(
    ([name, flag]) => (window as unknown as { measuredBeatProbe: Record<string, (flag: boolean | string) => Promise<unknown>> }).measuredBeatProbe[name as string]!(flag),
    [name, flag] as const,
  ) as Promise<T>;

describe.each(ENGINES)("in %s, the player measures a beat on a copy styled by the stage's stylesheets, and applies at once a beat that changes them (#2837)", (name, engine, need) => {
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
    await page.waitForFunction(() => "measuredBeatProbe" in window);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  test("a beat that rewrites a stylesheet cannot be measured on the copy, so it applies at once with its new picture veiled until drawn", async (context) => {
    if (!browser) return context.skip();
    const result = await probe<Fallen & { look: Look }>(page, "sheetChanged");
    console.log(`${name}: sheet changed ${JSON.stringify(result)}`);
    expect(result).toEqual({ look: { width: 300, color: "rgb(0, 128, 0)" }, applied: 1, waiting: false, veiled: true });
  });

  test("a beat that only enables a disabled stylesheet through its attributes cannot be measured on the copy, so it applies at once with its new picture veiled until drawn", async (context) => {
    if (!browser) return context.skip();
    const result = await probe<Fallen & { before: Look; look: Look }>(page, "sheetEnabled");
    console.log(`${name}: sheet enabled ${JSON.stringify(result)}`);
    expect(result).toEqual({
      before: { width: 100, color: "rgb(255, 0, 0)" },
      look: { width: 300, color: "rgb(0, 128, 0)" },
      applied: 1,
      waiting: false,
      veiled: true,
    });
  });

  test("a beat that changes the root text size cannot be measured on the copy, so it applies at once with its new picture veiled until drawn", async (context) => {
    if (!browser) return context.skip();
    const result = await probe<Fallen & { before: string; after: string }>(page, "rootTextSized");
    console.log(`${name}: root text size ${JSON.stringify(result)}`);
    expect(result).toEqual({ before: "", after: "20px", applied: 1, waiting: false, veiled: true });
  });

  test("while a beat that restyles an element waits for its picture, the page looks exactly as it did before the beat, though that element is styled visible", async (context) => {
    if (!browser) return context.skip();
    const scroll = await probe<{ width: number; height: number }>(page, "holdStyleChange");
    const before = await page.screenshot();
    const state = await probe<{ applied: number; waiting: boolean; scroll: { width: number; height: number } }>(page, "startStyleChange");
    const during = await page.screenshot();
    await probe(page, "endStyleChange");
    expect(state).toEqual({ applied: 0, waiting: true, scroll });
    expect(during.equals(before)).toBe(true);
  });

  test.for(["literal", "variable"])("a picture whose element runs a CSS animation of the stage's stylesheets is drawn at the scale its keyframes reach (%s)", async (kind, context) => {
    if (!browser) return context.skip();
    const result = await probe<{ asked: [number, number][]; applied: number; waiting: boolean }>(page, "styledAnimation", kind);
    console.log(`${name}: animation ${kind} ${JSON.stringify(result)}`);
    expect(result.asked).toEqual([[200, 100]]);
    expect(result.applied).toBe(0);
    expect(result.waiting).toBe(true);
  });

  test("a beat that removes the stylesheet sizing a shown picture applies at once, and the picture is then drawn at the size the removal leaves", async (context) => {
    if (!browser) return context.skip();
    const result = await probe<Removed>(page, "sheetRemoved");
    console.log(`${name}: removed ${JSON.stringify(result)}`);
    expect(result.first).toEqual([300, 50]);
    expect(result.asked).toEqual([[100, 50]]);
    expect(result.waiting).toBe(false);
    expect(result.applied).toBe(2);
    expect(result.width).toBe(100);
  });
});
