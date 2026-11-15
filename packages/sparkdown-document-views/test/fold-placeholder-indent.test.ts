// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildGutterMarksPage } from "./harness/gutter-marks.mjs";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Folded {
  chip: Box;
  line: Box;
  chipTextIndent: string;
  lineTextIndent: string;
  rows: number;
  gutterRight: number;
  title: string | null;
  label: string | null;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "fold-placeholder-"));
  pageUrl = await buildGutterMarksPage(outDir);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const LONG = "choose " + "a long heading for this menu that wraps ".repeat(4);

const block = (pad: string, head: string) =>
  [
    "scene start",
    pad + head,
    pad + "  * [Left.]",
    pad + "    You go left.",
    pad + "  * [Right.]",
    pad + "    You go right.",
    pad + "end",
    "The end.",
  ].join("\n");

const CASES: [string, string, number][] = [
  ["a line with no leading spaces", block("", "choose"), 2],
  ["a line with two leading spaces", block("  ", "choose"), 2],
  ["a line with four leading spaces", block("    ", "choose"), 2],
  ["a long line with four leading spaces that wraps", block("    ", LONG), 2],
  ["the first line, whose fold ends on the last line", ["choose", "  a", "  b", "  c", "  d", "end"].join("\n"), 1],
];

const open = async (width: number, coarse: boolean): Promise<Page> => {
  const context = await browser.newContext({
    viewport: { width, height: 700 },
    hasTouch: coarse,
    isMobile: coarse,
  });
  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForFunction(() => "gutterMarks" in window);
  expect(
    await page.evaluate(() => [innerWidth, matchMedia("(pointer: coarse)").matches]),
  ).toEqual([width, coarse]);
  await page.addStyleTag({
    content: `section { width: ${width - 32}px; height: 640px; } .cm-cursorLayer, .cm-selectionLayer { display: none !important; }`,
  });
  return page;
};

const foldAt = (page: Page, doc: string, line: number): Promise<Folded> =>
  page.evaluate(
    async ([text, at]) => {
      const marks = (window as unknown as { gutterMarks: { setDoc(t: string): void; fold(l: number): void; view: { contentDOM: HTMLElement } } }).gutterMarks;
      marks.setDoc(text);
      marks.fold(at);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      };
      const chip = document.querySelector(".cm-foldPlaceholder")!;
      const line = chip.closest(".cm-line")!;
      const lineHeight = parseFloat(getComputedStyle(line).lineHeight);
      const marksRight = [...document.querySelectorAll(".cm-fold-marker, .cm-breakpoint, .cm-choice-marker")]
        .map((el) => el.getBoundingClientRect().right);
      return {
        chip: box(chip),
        line: box(line),
        chipTextIndent: getComputedStyle(chip).textIndent,
        lineTextIndent: getComputedStyle(line).textIndent,
        rows: Math.round(line.getBoundingClientRect().height / lineHeight),
        gutterRight: Math.max(...marksRight),
        title: chip.getAttribute("title"),
        label: chip.getAttribute("aria-label"),
      };
    },
    [doc, line] as const,
  );

const shot = (page: Page, { left, top, width, height }: Box) =>
  page.screenshot({ clip: { x: left, y: top, width, height }, animations: "disabled" });

const hideChipGlyphs = (page: Page, hidden: boolean) =>
  page.evaluate(async (value) => {
    let style = document.getElementById("hide-chip-glyphs");
    if (!style) {
      style = document.head.appendChild(document.createElement("style"));
      style.id = "hide-chip-glyphs";
    }
    style.textContent = value ? ".cm-foldPlaceholder, .cm-foldPlaceholder::after { color: transparent !important; }" : "";
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, hidden);

describe.each([
  [430, false],
  [430, true],
  [1440, false],
  [1440, true],
])("a closed fold's chip at %i wide (coarse pointer: %s)", (width, coarse) => {
  it.each(CASES)("on %s draws its glyphs inside its outline and none over the line's text", async (_label, doc, line) => {
    const page = await open(width, coarse);
    const folded = await foldAt(page, doc, line);

    const { chip } = folded;
    const textOnChipRow = {
      left: folded.line.left,
      top: chip.top,
      width: chip.left - folded.line.left,
      height: chip.height,
    };
    const insideChip = {
      left: chip.left + 2,
      top: chip.top + 2,
      width: chip.width - 4,
      height: chip.height - 4,
    };
    const shown = [await shot(page, textOnChipRow), await shot(page, insideChip)];
    await hideChipGlyphs(page, true);
    const hidden = [await shot(page, textOnChipRow), await shot(page, insideChip)];
    expect(shown[0]!.equals(hidden[0]!)).toBe(true);
    expect(shown[1]!.equals(hidden[1]!)).toBe(false);

    expect(folded.chipTextIndent).toBe("0px");
    expect(chip.left).toBeGreaterThanOrEqual(folded.gutterRight);
    expect(chip.left + chip.width).toBeLessThanOrEqual(folded.line.left + folded.line.width);
    await page.context().close();
  });

  it("keeps the hanging indent of a wrapped folded line", async () => {
    const page = await open(width, coarse);
    const folded = await foldAt(page, block("    ", LONG), 2);
    expect(folded.lineTextIndent).not.toBe("0px");
    expect(parseFloat(folded.lineTextIndent)).toBeLessThan(0);
    if (width === 430) {
      expect(folded.rows).toBeGreaterThan(1);
    }
    await page.context().close();
  });
});

describe("a closed fold's chip", () => {
  it("shows the dots alone and gives the hidden line count in its title and label", async () => {
    const page = await open(430, false);
    const folded = await foldAt(page, block("    ", "choose"), 2);
    expect(await page.evaluate(() => document.querySelector(".cm-foldPlaceholder")!.textContent)).toBe("");
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector(".cm-foldPlaceholder")!, "::after").content),
    ).toBe('"⋯"');
    expect(folded.title).toBe("5 lines");
    expect(folded.label).toBe("unfold: 5 lines");
    await page.context().close();
  });
});
