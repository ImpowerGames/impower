// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildScreenplayHangPage } from "./harness/screenplay-hang.mjs";

const LONG = "The reader sees these words and keeps on reading them all the way to the far end of a long line that must wrap.";

const nested = (depth: number) => {
  const lines: string[] = [];
  for (let level = 0; level <= depth; level++) {
    const indent = "  ".repeat(level * 2 + 1);
    lines.push(`${indent}queue`, `${indent}  | Short ${level}.`, `${indent}  |${level === depth ? ` ${LONG}` : ""}`);
  }
  for (let level = depth; level >= 0; level--) lines.push(`${"  ".repeat(level * 2 + 1)}end`);
  return ["scene s", ...lines, "end", ""].join("\n");
};

const HANGING = ["depth 0", "depth 1", "depth 2", "depth 7"];

interface PageRows {
  markLeft: number;
  rows: number[];
  lineRight: number;
  rightmost: number;
  overflow: number;
}

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "screenplay-hang-"));
  pageUrl = await buildScreenplayHangPage(outDir);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const pageRows = async (): Promise<Record<string, PageRows>> => {
  const page = await browser.newPage({ viewport: { width: 520, height: 6000 } });
  await page.goto(pageUrl);
  await page.waitForFunction(() => "screenplayHang" in window);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const found = await page.evaluate(() => {
    const result: Record<string, PageRows> = {};
    for (const section of Array.from(document.querySelectorAll<HTMLElement>("section"))) {
      const line = Array.from(section.querySelectorAll(".cm-line")).find((row) => row.textContent?.includes("The reader sees"))!;
      const mark = line.querySelector(".sp-inserted")!;
      const texts: Text[] = [];
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement?.closest(".sp-inserted") && node.textContent?.trim()) texts.push(node as Text);
      }
      const range = document.createRange();
      range.setStart(texts[0]!, 0);
      range.setEnd(texts.at(-1)!, texts.at(-1)!.length);
      const byTop = new Map<number, number>();
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width === 0) continue;
        const top = Math.round(rect.top);
        byTop.set(top, Math.min(byTop.get(top) ?? Infinity, rect.left));
      }
      let rightmost = 0;
      const glyph = document.createRange();
      for (const node of texts) {
        for (let index = 0; index < node.length; index++) {
          if (!node.data[index]!.trim()) continue;
          glyph.setStart(node, index);
          glyph.setEnd(node, index + 1);
          rightmost = Math.max(rightmost, glyph.getBoundingClientRect().right);
        }
      }
      result[section.dataset["fixture"]!] = {
        markLeft: mark.getBoundingClientRect().left,
        rows: [...byTop.entries()].sort(([a], [b]) => a - b).map(([, left]) => left),
        lineRight: line.getBoundingClientRect().right,
        rightmost,
        overflow: line.scrollWidth - line.clientWidth,
      };
    }
    return result;
  });
  await page.close();
  return found;
};

const FONT_DIR = resolve(__dirname, "../../../impower-dev/src/public/fonts");

const readFont = (name: string): ArrayBuffer => {
  const bytes = readFileSync(resolve(FONT_DIR, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const FONTS = {
  normal: readFont("courier-prime.ttf"),
  bold: readFont("courier-prime-bold.ttf"),
  italic: readFont("courier-prime-italic.ttf"),
  bolditalic: readFont("courier-prime-bold-italic.ttf"),
};

interface Draw {
  text: string;
  x: number;
  y: number;
  width: number;
}

const pdfDraws = async (script: string): Promise<Draw[]> => {
  const { buildPDF } = await import(pathToFileURL(resolve(__dirname, "../../sparkdown-screenplay-pdf/src/buildPDF.ts")).href);
  const draws: Draw[] = [];
  const prototype = PDFDocument.prototype as unknown as { text: (...args: unknown[]) => unknown };
  const text = prototype.text;
  const spy = vi.spyOn(prototype, "text").mockImplementation(function (this: PDFKit.PDFDocument, ...args: unknown[]) {
    const [value, x, y] = args as [unknown, number, number];
    if (typeof value === "string" && typeof x === "number" && typeof y === "number") {
      draws.push({ text: value, x, y, width: this.widthOfString(value) });
    }
    return text.apply(this, args);
  });
  try {
    await buildPDF([script], { screenplay_print_title_page: false }, FONTS);
  } finally {
    spy.mockRestore();
  }
  return draws;
};

const pdfRows = (draws: Draw[]) => {
  const start = draws.find((draw) => draw.text.includes("The"))!;
  const rows = new Map<number, number>();
  for (const draw of draws) {
    if (draw.y < start.y || !draw.text.trim() || !LONG.includes(draw.text.trim())) continue;
    rows.set(draw.y, Math.min(rows.get(draw.y) ?? Infinity, draw.x));
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, x]) => x);
};

describe("a wrapped row of an alternative", () => {
  it("continues under its text, after its bar, on the page at every supported depth", async () => {
    const rows = await pageRows();
    for (const fixture of HANGING) {
      const found = rows[fixture]!;
      expect(found.rows.length, fixture).toBeGreaterThan(1);
      expect(found.markLeft, fixture).toBeLessThan(found.rows[0]!);
      for (const left of found.rows) expect(Math.abs(left - found.rows[0]!), fixture).toBeLessThan(0.5);
      expect(found.overflow, fixture).toBeLessThanOrEqual(0);
      expect(found.rightmost, fixture).toBeLessThanOrEqual(found.lineRight + 0.5);
    }
    const deepest = rows["depth 8"]!;
    expect(deepest.rows.length).toBeGreaterThan(1);
    expect(deepest.rows[1]!).toBeLessThan(deepest.rows[0]!);
    expect(deepest.overflow).toBeLessThanOrEqual(0);
    expect(deepest.rightmost).toBeLessThanOrEqual(deepest.lineRight + 0.5);
  }, 120_000);

  it.each([0, 1, 2, 7])("continues under its text, after its bar, in the PDF at depth %i", async (depth) => {
    const draws = await pdfDraws(nested(depth));
    const rows = pdfRows(draws);
    expect(rows.length).toBeGreaterThan(1);
    for (const x of rows) expect(Math.abs(x - rows[0]!)).toBeLessThan(0.01);
    for (const draw of draws) expect(draw.x + draw.width).toBeLessThanOrEqual(612);
  });

  it("wraps from the line's left in the PDF past the deepest hanging depth, inside the page", async () => {
    const draws = await pdfDraws(nested(8));
    const rows = pdfRows(draws);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]!).toBeLessThan(rows[0]!);
    for (const draw of draws) expect(draw.x + draw.width).toBeLessThanOrEqual(612);
  });
});
