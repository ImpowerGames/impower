// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
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

interface Blocks {
  row: number;
  blocks: { at: string; kind: string; height: number }[];
}

interface Drift {
  line: number;
  drawn: number;
  placed: number;
}

interface Scroll {
  jumps: string[];
  drifts: Drift[];
  estimated: Blocks;
  rendered: Blocks;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;
const scrolls = new Map<number, Promise<Scroll>>();

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "screenplay-block-heights-"));
  pageUrl = await buildScreenplayGeometryPage(outDir);
  browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const scrollThrough = async (page: Page, width: number): Promise<Scroll> => {
  await page.goto(pageUrl);
  await page.waitForFunction(() => "renderScreenplay" in window);
  await page.evaluate(() =>
    Promise.all(["normal", "bold", "italic", "bold italic"].map((face) => document.fonts.load(`${face} 12px "Courier Prime"`))),
  );
  await page.evaluate(
    ([text, settings, w]) =>
      (window as unknown as { renderScreenplay: (...args: unknown[]) => void }).renderScreenplay("fixture", text, settings, 0, w),
    [SCRIPTS.join("\n").repeat(4), CONFIG, width] as const,
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return page.evaluate(async () => {
    const hooks = window as unknown as { blockHeights: () => Blocks; lineDrift: () => Drift[] };
    const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frames();
    const estimated = hooks.blockHeights();
    const jumps: string[] = [];
    const drifts: Drift[] = [];
    let height = document.documentElement.scrollHeight;
    for (let top = 0; top < document.documentElement.scrollHeight; top += 300) {
      window.scrollTo(0, top);
      await frames();
      const next = document.documentElement.scrollHeight;
      if (Math.abs(next - height) > 1) jumps.push(`at ${top}px: ${height} to ${next}`);
      height = next;
      drifts.push(...hooks.lineDrift());
    }
    return { jumps, drifts, estimated, rendered: hooks.blockHeights() };
  });
};

const scrolled = (width: number) => {
  let found = scrolls.get(width);
  if (!found) {
    found = browser.newPage({ viewport: { width: width + 40, height: 600 } }).then(async (page) => {
      try {
        return await scrollThrough(page, width);
      } finally {
        await page.close();
      }
    });
    scrolls.set(width, found);
  }
  return found;
};

const causeOf = (kind: string, height: number, row: number) =>
  kind !== "text" ? kind : height < 1 ? "hidden line" : height > row * 1.5 ? "wrapped text" : "text";

describe("the Screenplay page", () => {
  it.each([760, 430])("keeps a long script's scroll height steady while scrolling a %spx page", async (width) => {
    expect((await scrolled(width)).jumps).toEqual([]);
  }, 240_000);

  it.each([760, 430])("estimates every block at the height it renders on a %spx page", async (width) => {
    const { estimated, rendered } = await scrolled(width);
    const estimates = new Map(estimated.blocks.map((block) => [block.at, block.height]));
    const mismatches = new Map<string, number>();
    const causes = new Set<string>();
    for (const { at, kind, height } of rendered.blocks) {
      const cause = causeOf(kind, height, rendered.row);
      causes.add(cause);
      const estimate = estimates.get(at);
      if (estimate === undefined || Math.abs(estimate - height) > 1) mismatches.set(cause, (mismatches.get(cause) ?? 0) + 1);
    }
    expect([...causes].sort()).toEqual(
      expect.arrayContaining(["collapse", "hidden line", "name after a page break", "page break", "text", "wrapped text"]),
    );
    expect(Object.fromEntries(mismatches)).toEqual({});
  }, 240_000);

  it.each([760, 430])("draws each line where CodeMirror places it on a %spx page", async (width) => {
    const drifted = (await scrolled(width)).drifts
      .filter(({ drawn, placed }) => Math.abs(drawn - placed) > 1)
      .map(({ line, drawn, placed }) => `line ${line}: drawn at ${drawn.toFixed(2)}, placed at ${placed.toFixed(2)}`);
    expect(drifted.slice(0, 5)).toEqual([]);
  }, 240_000);
});
