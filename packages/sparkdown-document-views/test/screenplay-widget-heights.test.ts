// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { buildScreenplayGeometryPage } from "./harness/screenplay-geometry.mjs";

const CONFIG: ScreenplayConfig = {
  screenplay_print_title_page: false,
  screenplay_print_page_numbers: false,
  screenplay_print_scene_numbers: "both",
  screenplay_print_scene_identifiers: true,
  screenplay_print_branch_identifiers: true,
  screenplay_print_function_identifiers: true,
};

const SCRIPTS = [
  readFileSync(resolve(__dirname, "fixtures/demo-screenplay/chapter_1.sd"), "utf8").replace(/\r\n/g, "\n"),
  [
    "scene long_dual",
    "  THEO [<]:",
    "    I take it back, every single word of it, and I mean that sincerely this time.",
    "  ZADIE [>]:",
    "    Best. Night. Ever. Nobody will ever believe a word of what happened here tonight.",
    "  (quietly, to nobody in particular)",
    "  MARCUS:",
    "    Afterwards.",
    "end",
    "",
  ].join("\n"),
  ["scene with_function", "  function greet()", "    GUIDE:", "      Hello there.", "  end", "  Afterwards.", "end", ""].join("\n"),
  ["scene", "  Before.", "end", "scene", "  After.", "end", ""].join("\n"),
  [
    "scene shared",
    "  Before.",
    "  GUIDE: Hi. local z = 3",
    "  queue | One. | Two. end function f() end",
    "  : They go. x = 2",
    "  After.",
    "end",
    "",
  ].join("\n"),
];

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
    [script, CONFIG, width] as const,
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
    for (const script of SCRIPTS) {
      for (const { kind, estimated, rendered } of await widgetHeights(script, width)) {
        kinds.add(kind);
        if (Math.abs(estimated - rendered) > 1) differences.push(`${kind}: estimate ${estimated.toFixed(2)}, rendered ${rendered.toFixed(2)}`);
      }
    }
    expect([...kinds].sort()).toEqual(["dialogue", "inserted row", "name", "name after a page break", "page break"]);
    expect(differences).toEqual([]);
  }, 240_000);
});
