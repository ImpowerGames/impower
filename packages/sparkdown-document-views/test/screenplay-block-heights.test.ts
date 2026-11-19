// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildScreenplayGeometryPage } from "./harness/screenplay-geometry.mjs";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { GEOMETRY_CONFIG, GEOMETRY_SCRIPTS } from "./helpers/screenplayGeometryScripts";

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
  wrapping: boolean;
  jumps: string[];
  drifts: Drift[];
  estimated: Blocks;
  rendered: Blocks;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;
const scrolls = new Map<string, Promise<Scroll>>();

const SCRIPT = GEOMETRY_SCRIPTS.join("\n").repeat(4);

const LONG_HIDDEN_LINE = `// ${"hidden ".repeat(800)}\n`;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "screenplay-block-heights-"));
  pageUrl = await buildScreenplayGeometryPage(outDir);
  browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const LONG_FRONT_MATTER = `---\ntitle: Short title\ncustom: ${"hidden ".repeat(800)}\n---\n\n`;

const TITLE_PAGE_CONFIG: ScreenplayConfig = { ...GEOMETRY_CONFIG, screenplay_print_title_page: true };

const LONG_PRINTED_LINE = `scene long_action\n  ${"word ".repeat(1500)}TAIL\nend\n`;

const LONG_ALIGNED_LINE = `scene long_aligned\n  ${"Left words ".repeat(200)}^Centered words^ ${"Right words ".repeat(200)}\nend\n`;

const MARKED = "The reader keeps **reading the bold words** and *the slanted ones* and _the underlined ones_ while {name} waits.";

const COMPARED = [
  "scene compared",
  "  queue",
  `    | ${Array(6).fill(MARKED).join(" ")}`,
  "  end",
  `  ${Array(6).fill(MARKED).join(" ")}`,
  `  _${"underlined words run on ".repeat(12)}to the end_`,
  `  ${"Left words ".repeat(12)}^Centered words^ ${"Right words ".repeat(12)}`,
  "end",
  "",
].join("\n");

const render = async (page: Page, script: string, width: number, config: ScreenplayConfig, paragraphLength?: number) => {
  await page.goto(pageUrl);
  await page.waitForFunction(() => "renderScreenplay" in window);
  await page.evaluate(() =>
    Promise.all(["normal", "bold", "italic", "bold italic"].map((face) => document.fonts.load(`${face} 12px "Courier Prime"`))),
  );
  await page.evaluate(
    ([text, settings, w, length]) =>
      (window as unknown as { renderScreenplay: (...args: unknown[]) => void }).renderScreenplay("fixture", text, settings, 0, w, length),
    [script, config, width, paragraphLength] as const,
  );
};

const scrollThrough = async (page: Page, script: string, width: number, config: ScreenplayConfig): Promise<Scroll> => {
  await render(page, script, width, config);
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
    const wrapping = document.querySelector(".cm-content")?.classList.contains("cm-lineWrapping") ?? false;
    return { wrapping, jumps, drifts, estimated, rendered: hooks.blockHeights() };
  });
};

const scrolled = (width: number, script = SCRIPT, config = GEOMETRY_CONFIG) => {
  const key = `${width}:${JSON.stringify(config)}:${script}`;
  let found = scrolls.get(key);
  if (!found) {
    found = browser.newPage({ viewport: { width: width + 40, height: 600 } }).then(async (page) => {
      try {
        return await scrollThrough(page, script, width, config);
      } finally {
        await page.close();
      }
    });
    scrolls.set(key, found);
  }
  return found;
};

const causeOf = (kind: string, height: number, row: number) =>
  kind !== "text" ? kind : height < 1 ? "hidden line" : height > row * 1.5 ? "wrapped text" : "text";

const estimateMismatches = ({ estimated, rendered }: Scroll) => {
  const estimates = new Map(estimated.blocks.map((block) => [block.at, block.height]));
  const mismatches = new Map<string, number>();
  const causes = new Set<string>();
  for (const { at, kind, height } of rendered.blocks) {
    const cause = causeOf(kind, height, rendered.row);
    causes.add(cause);
    const estimate = estimates.get(at);
    if (estimate === undefined || Math.abs(estimate - height) > 1) mismatches.set(cause, (mismatches.get(cause) ?? 0) + 1);
  }
  return { causes: [...causes].sort(), mismatches: Object.fromEntries(mismatches) };
};

interface Drawing {
  paragraph: boolean;
  inserted: number;
  box: string;
  lit: string;
  glyphs: string[];
}

const drawings = async (lineNumbers: number[], paragraphLength?: number) => {
  const page = await browser.newPage({ viewport: { width: 800, height: 2000 } });
  try {
    await render(page, COMPARED, 760, GEOMETRY_CONFIG, paragraphLength);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const found: Drawing[] = [];
    for (const lineNumber of lineNumbers) {
      found.push(
        await page.evaluate(async (number) => {
          const hooks = window as unknown as { paragraphDrawing: (line: number) => Promise<Omit<Drawing, "paragraph" | "inserted">> };
          const drawing = await hooks.paragraphDrawing(number);
          const lit = document.querySelector(".cm-content > .sp-lit, .cm-content > .cm-activeLine");
          return {
            ...drawing,
            paragraph: lit?.classList.contains("sp-paragraph") ?? false,
            inserted: lit?.querySelectorAll(".sp-inserted").length ?? 0,
          };
        }, lineNumber),
      );
    }
    return found;
  } finally {
    await page.close();
  }
};

describe("the Screenplay page", () => {
  it.each([760, 430])("keeps a long script's scroll height steady while scrolling a %spx page", async (width) => {
    const { wrapping, jumps } = await scrolled(width);
    expect({ wrapping, jumps }).toEqual({ wrapping: false, jumps: [] });
  }, 240_000);

  it.each([760, 430])("keeps the scroll height steady on a %spx page when a hidden line is too long to draw unwrapped", async (width) => {
    const { wrapping, jumps } = await scrolled(width, `${SCRIPT}${LONG_HIDDEN_LINE}`);
    expect({ wrapping, jumps }).toEqual({ wrapping: false, jumps: [] });
  }, 240_000);

  it.each([760, 430])("keeps the scroll height steady on a %spx page when printed front matter hides a line too long to draw unwrapped", async (width) => {
    const { wrapping, jumps } = await scrolled(width, `${LONG_FRONT_MATTER}${SCRIPT}`, TITLE_PAGE_CONFIG);
    expect({ wrapping, jumps }).toEqual({ wrapping: false, jumps: [] });
  }, 240_000);

  it.each([760, 430])("keeps the scroll height steady on a %spx page when a printed line is too long to draw unwrapped", async (width) => {
    const { wrapping, jumps } = await scrolled(width, `${SCRIPT}${LONG_PRINTED_LINE}`);
    expect({ wrapping, jumps }).toEqual({ wrapping: false, jumps: [] });
  }, 240_000);

  it.each([760, 430])("estimates every block at the height it renders on a %spx page", async (width) => {
    const { causes, mismatches } = estimateMismatches(await scrolled(width));
    expect(causes).toEqual(
      expect.arrayContaining(["collapse", "hidden line", "name after a page break", "page break", "text", "wrapped text"]),
    );
    expect(mismatches).toEqual({});
  }, 240_000);

  it.each([760, 430])("estimates a printed line too long to draw unwrapped at the height it renders on a %spx page", async (width) => {
    const { causes, mismatches } = estimateMismatches(await scrolled(width, `${SCRIPT}${LONG_PRINTED_LINE}`));
    expect(causes).toContain("paragraph");
    expect(mismatches).toEqual({});
  }, 240_000);

  it.each([760, 430])("estimates a printed line too long to draw unwrapped that centres part of its text at the height it renders on a %spx page", async (width) => {
    const { causes, mismatches } = estimateMismatches(await scrolled(width, `${SCRIPT}${LONG_ALIGNED_LINE}`));
    expect(causes).toContain("paragraph");
    expect(mismatches).toEqual({});
  }, 240_000);

  it.each([760, 430])("draws each line where CodeMirror places it on a %spx page", async (width) => {
    const drifted = (await scrolled(width)).drifts
      .filter(({ drawn, placed }) => Math.abs(drawn - placed) > 1)
      .map(({ line, drawn, placed }) => `line ${line}: drawn at ${drawn.toFixed(2)}, placed at ${placed.toFixed(2)}`);
    expect(drifted.slice(0, 5)).toEqual([]);
  }, 240_000);

  it("shows every word of a printed source line of 4000 or more characters without wrapping", async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await render(page, LONG_PRINTED_LINE, 760, GEOMETRY_CONFIG);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const seen = await page.evaluate(async () => {
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let words = 0;
      let tail = false;
      for (let top = 0; top < document.documentElement.scrollHeight; top += 300) {
        window.scrollTo(0, top);
        await frames();
        const text = document.querySelector(".cm-content")?.textContent ?? "";
        words = Math.max(words, text.match(/word/g)?.length ?? 0);
        tail ||= text.includes("TAIL");
      }
      const wrapping = document.querySelector(".cm-content")?.classList.contains("cm-lineWrapping") ?? false;
      return { wrapping, words, tail };
    });
    await page.close();
    expect(seen).toEqual({ wrapping: false, words: 1500, tail: true });
  }, 240_000);

  it("draws a printed paragraph through its printed rows exactly as CodeMirror draws its text", async () => {
    const lines = [3, 5, 6, 7];
    const [text, rows] = [await drawings(lines), await drawings(lines, 1)];
    expect(text!.map(({ paragraph }) => paragraph)).toEqual([false, false, false, false]);
    expect(rows!.map(({ paragraph }) => paragraph)).toEqual([true, true, true, true]);
    expect(text!.every(({ glyphs }) => glyphs.length > 200)).toBe(true);
    expect(text!.some(({ inserted }) => inserted > 0)).toBe(true);
    const glyphs = text!.flatMap((drawing) => drawing.glyphs).join("\n");
    expect([/ 700 /, / italic /, /underline/].filter((mark) => !mark.test(glyphs))).toEqual([]);
    expect(text!.filter(({ lit }) => lit.startsWith("rgba(0, 0, 0, 0)"))).toEqual([]);
    const shown = (drawing: Drawing) => ({ box: drawing.box, lit: drawing.lit, glyphs: drawing.glyphs });
    expect(rows!.map(shown)).toEqual(text!.map(shown));
  }, 240_000);
});

