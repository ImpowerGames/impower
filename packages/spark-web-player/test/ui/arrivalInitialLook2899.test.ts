// @vitest-environment node
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

interface Arrival {
  marked: number[];
  shown: number[];
  settled: number;
  pulsing: string[];
}

let outDir: string;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "arrival-initial-"));
  await build({
    entryPoints: [resolve(__dirname, "harness/arrivalInitialPage.ts")],
    bundle: true,
    format: "iife",
    outfile: join(outDir, "page.js"),
    logLevel: "silent",
  });
  const file = join(outDir, "page.html");
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><body style="margin:0"><script src="page.js"></script></body>`);
  browser = await chromium.launch();
  page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => "arrivalProbe" in window);
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const arrive = (reserved: boolean) =>
  page.evaluate(
    (reserved) =>
      (window as unknown as { arrivalProbe: { arrive(reserved: boolean): Promise<Arrival> } }).arrivalProbe.arrive(reserved),
    reserved,
  );

describe.each([
  ["already on screen", false],
  ["held hidden until its line", true],
])("in Chromium, an element %s that is given its initial mark (#2899)", (_, reserved) => {
  test("shows its @initial look from the first frame after the mark, then fades in when its show begins", async () => {
    const result = await arrive(reserved);
    console.log(JSON.stringify(result));
    expect(result.marked).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.shown.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
    expect(result.settled).toBe(1);
  });

  test("keeps running the animation its @initial look starts", async () => {
    const result = await arrive(reserved);
    expect(result.pulsing).toEqual(["running"]);
  });
});
