// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildScreenplayHangPage } from "./harness/screenplay-hang.mjs";

const LONG = "The reader sees these words and keeps on reading them all the way to the far edge of a long line that must wrap.";

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
  lineLeft: number;
  lineRight: number;
  rightmost: number;
  overflow: number;
  others: Record<string, number>;
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
  const found = await page.evaluate((long) => {
    const result: Record<string, PageRows> = {};
    for (const section of Array.from(document.querySelectorAll<HTMLElement>("section"))) {
      const line = Array.from(section.querySelectorAll(".cm-line")).find((row) => row.textContent?.includes("The reader sees"))!;
      const texts: Text[] = [];
      const others: Text[] = [];
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? "";
        if (!text) continue;
        if (node.parentElement?.closest(".sp-inserted-row")) others.push(node as Text);
        else if (node.parentElement?.closest(".sp-inserted")) continue;
        else if (long.includes(text)) texts.push(node as Text);
        else others.push(node as Text);
      }
      const marks = Array.from(line.querySelectorAll(".sp-inserted")).filter(
        (element) => /^[| ]+$/.test(element.textContent ?? "") && !element.closest(".sp-inserted-row"),
      );
      const mark = marks.filter((element) => element.compareDocumentPosition(texts[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)!;
      const edge = (node: Text) => {
        const start = node.data.search(/\S/);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + 1);
        return range.getBoundingClientRect().left;
      };
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
        lineLeft: line.getBoundingClientRect().left,
        lineRight: line.getBoundingClientRect().right,
        rightmost,
        overflow: line.scrollWidth - line.clientWidth,
        others: Object.fromEntries(others.map((node) => [node.data.trim(), edge(node)])),
      };
    }
    return result;
  }, LONG);
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

  it("continues under its text on a source line shared with other printed rows, which keep their own edge, on the page", async () => {
    const rows = await pageRows();
    const near = (a: number | undefined, b: number, label: string, within = 0.5) => expect(Math.abs(a! - b), label).toBeLessThan(within);
    for (const fixture of ["shared with text", "shared with a block"]) {
      const found = rows[fixture]!;
      expect(found.rows.length, fixture).toBeGreaterThan(1);
      expect(found.markLeft, fixture).toBeLessThan(found.rows[0]!);
      for (const left of found.rows) near(left, found.rows[0]!, fixture);
      near(found.markLeft, found.lineLeft, `${fixture} bar`, 1);
    }
    const text = rows["shared with text"]!;
    near(text.others["Short."], text.rows[0]!, "Short.");
    near(text.others["}"], text.lineLeft, "closing brace", 1);
    near(text.others["Afterwards."], text.lineLeft, "Afterwards.", 1);
    const block = rows["shared with a block"]!;
    near(block.others["One."], block.rows[0]!, "One.");
    near(block.others["Two."], block.rows[0]!, "Two.");
    near(block.others["}"], block.lineLeft, "first block's closing brace", 1);
    near(block.others["{"], block.lineLeft, "second block's opening brace", 1);
  }, 120_000);

  it("leaves an unmarked row sharing a hanging line to wrap from the line's edge, on the page as in the PDF", async () => {
    const found = (await pageRows())["unmarked text wrapping after a block"]!;
    expect(found.rows.length).toBeGreaterThan(1);
    for (const left of found.rows) expect(Math.abs(left - found.lineLeft), "page row").toBeLessThan(1);
    expect(found.others["One."]! - found.lineLeft, "the alternative still hangs").toBeGreaterThan(5);
    const draws = await pdfDraws(["scene s", `  queue | One. | Two. end : ${LONG}`, "end", ""].join("\n"));
    const brace = draws.find((draw) => draw.text.trim() === "{")!;
    const rows = pdfRows(draws);
    expect(rows.length).toBeGreaterThan(1);
    for (const x of rows) expect(Math.abs(x - brace.x), "PDF row").toBeLessThan(0.01);
  }, 120_000);

  it("hangs each row by its own depth when one source line holds rows of two depths, on the page as in the PDF", async () => {
    const script = ["scene s", "  if flag then", `    queue | ${LONG} | Short. end : Outer tail.`, "  end", "end", ""].join("\n");
    const found = (await pageRows())["mixed depths on one line"]!;
    expect(found.rows.length).toBeGreaterThan(1);
    expect(found.markLeft).toBeLessThan(found.rows[0]!);
    for (const left of found.rows) expect(Math.abs(left - found.rows[0]!), "page row").toBeLessThan(0.5);
    expect(Math.abs(found.others["Short."]! - found.rows[0]!), "Short.").toBeLessThan(0.5);
    const cell = (found.rows[0]! - found.markLeft) / 4;
    expect(Math.abs(found.others["Outer tail."]! - (found.markLeft + 2 * cell)), "Outer tail.").toBeLessThan(1);
    const draws = await pdfDraws(script);
    const rows = pdfRows(draws);
    expect(rows.length).toBeGreaterThan(1);
    for (const x of rows) expect(Math.abs(x - rows[0]!), "PDF row").toBeLessThan(0.01);
  }, 120_000);

  it("keeps its hanging indent across a PDF page break", async () => {
    const words = Array.from({ length: 300 }, (_, index) => `Word${index}`).join(" ");
    const script = [
      "scene s",
      ...Array.from({ length: 40 }, () => "  Lead."),
      "  queue",
      `    | ${words}`,
      "    | Short.",
      "  end",
      "end",
      "",
    ].join("\n");
    const draws = (await pdfDraws(script)).filter((draw) => /^Word\d+/.test(draw.text.trim()));
    const rowLefts = new Map<number, number>();
    for (const draw of draws) rowLefts.set(draw.y, Math.min(rowLefts.get(draw.y) ?? Infinity, draw.x));
    const first = draws.find((draw) => draw.text.includes("Word0"))!;
    expect(draws.some((draw) => draw.y < first.y), "the alternative continues on the next page").toBe(true);
    expect([...new Set([...rowLefts.values()].map((x) => x.toFixed(3)))]).toEqual([first.x.toFixed(3)]);
  });

  it("wraps from the line's left in the PDF past the deepest hanging depth, inside the page", async () => {
    const draws = await pdfDraws(nested(8));
    const rows = pdfRows(draws);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]!).toBeLessThan(rows[0]!);
    for (const draw of draws) expect(draw.x + draw.width).toBeLessThanOrEqual(612);
  });
});
