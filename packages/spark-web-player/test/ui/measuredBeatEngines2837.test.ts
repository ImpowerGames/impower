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

interface WhileWaiting {
  before: Look;
  during: Look;
  applied: number;
  waiting: boolean;
}

interface Removed {
  first: [number, number] | undefined;
  asked: [number, number][];
  waiting: boolean;
  appliedBefore: number;
  appliedAfter: number;
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

describe.each(ENGINES)("in %s, the player measures a beat that changes the stage's stylesheets on a copy whose styles are its own (#2837)", (name, engine, need) => {
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

  test("a beat that rewrites a stylesheet leaves the shown stage styled as it was while the beat waits for its picture", async (context) => {
    if (!browser) return context.skip();
    const result = await probe<WhileWaiting>(page, "sheetChangeWhileWaiting");
    console.log(`${name}: while waiting ${JSON.stringify(result)}`);
    expect(result.waiting).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.before).toEqual({ width: 100, color: "rgb(0, 0, 255)" });
    expect(result.during).toEqual(result.before);
  });

  test.for([false, true])("while a beat that rewrites a stylesheet (as CSS text: %s) waits for its picture, the page looks exactly as it did before the beat, though an element of the stage is styled visible", async (text, context) => {
    if (!browser) return context.skip();
    const scroll = await probe<{ width: number; height: number }>(page, "holdSheetChange");
    const before = await page.screenshot();
    const state = await probe<{ applied: number; waiting: boolean; scroll: { width: number; height: number } }>(page, "startSheetChange", text);
    const during = await page.screenshot();
    await probe(page, "endSheetChange");
    expect(state).toEqual({ applied: 0, waiting: true, scroll });
    expect(during.equals(before)).toBe(true);
  });

  test.for(["literal", "variable", "media"])("a beat that changes the keyframes of a CSS animation on a picture's element draws the picture at the scale those keyframes reach (%s)", async (kind, context) => {
    if (!browser) return context.skip();
    const result = await probe<{ asked: [number, number][]; applied: number; waiting: boolean }>(page, "keyframesChanged", kind);
    console.log(`${name}: keyframes ${kind} ${JSON.stringify(result)}`);
    expect(result.asked).toEqual([[200, 100]]);
    expect(result.applied).toBe(0);
    expect(result.waiting).toBe(true);
  });

  test("a beat that removes the stylesheet sizing a shown picture draws it at the size the removal leaves before the beat fires", async (context) => {
    if (!browser) return context.skip();
    const result = await probe<Removed>(page, "sheetRemoved");
    console.log(`${name}: removed ${JSON.stringify(result)}`);
    expect(result.first).toEqual([300, 50]);
    expect(result.asked).toEqual([[100, 50]]);
    expect(result.waiting).toBe(true);
    expect(result.appliedBefore).toBe(1);
    expect(result.appliedAfter).toBe(2);
    expect(result.width).toBe(100);
  });
});
