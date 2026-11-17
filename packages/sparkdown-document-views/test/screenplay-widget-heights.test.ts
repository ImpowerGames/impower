// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildScreenplayGeometryPage } from "./harness/screenplay-geometry.mjs";
import { GEOMETRY_CONFIG, GEOMETRY_SCRIPTS } from "./helpers/screenplayGeometryScripts";

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "screenplay-widget-heights-"));
  pageUrl = await buildScreenplayGeometryPage(outDir);
  browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const widgetHeights = async (script: string, width: number) => {
  const page = await browser.newPage({ viewport: { width: width + 40, height: 6000 } });
  await page.goto(pageUrl);
  await page.waitForFunction(() => "renderScreenplay" in window);
  await page.evaluate(() =>
    Promise.all(["normal", "bold", "italic", "bold italic"].map((face) => document.fonts.load(`${face} 12px "Courier Prime"`))),
  );
  await page.evaluate(
    ([text, settings, w]) =>
      (window as unknown as { renderScreenplay: (...args: unknown[]) => void }).renderScreenplay("fixture", text, settings, 0, w),
    [script, GEOMETRY_CONFIG, width] as const,
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const result = await page.evaluate(() =>
    (window as unknown as { widgetHeights: () => { kind: string; estimated: number; rendered: number }[] }).widgetHeights(),
  );
  await page.close();
  return result;
};

describe("the Screenplay page's widgets", () => {
  it.each([760, 430])("are estimated at the height they render on a %spx page", async (width) => {
    const differences: string[] = [];
    const kinds = new Set<string>();
    for (const script of GEOMETRY_SCRIPTS) {
      for (const { kind, estimated, rendered } of await widgetHeights(script, width)) {
        kinds.add(kind);
        if (Math.abs(estimated - rendered) > 1) differences.push(`${kind}: estimate ${estimated.toFixed(2)}, rendered ${rendered.toFixed(2)}`);
      }
    }
    expect([...kinds].sort()).toEqual(["dialogue", "inserted row", "name", "name after a page break", "page break"]);
    expect(differences).toEqual([]);
  }, 240_000);
});
