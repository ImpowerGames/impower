// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { KINDS } from "./helpers/screenplayParity";
import { buildScreenplayGeometryPage, EMOJI_FONT_URL } from "./harness/screenplay-geometry.mjs";

const FIXTURE_DIR = resolve(__dirname, "fixtures/demo-screenplay");

const fixture = (name: string) => readFileSync(resolve(FIXTURE_DIR, name), "utf8").replace(/\r\n/g, "\n");

const DEMO = ["chapter_1.sd", "chapter_2.sd", "chapter_3.sd", "epilogue.sd", "verify_screenplay.sd", "verify_start.sd"];

const BASE: ScreenplayConfig = { screenplay_print_title_page: false, screenplay_print_page_numbers: false };

const NAMED: ScreenplayConfig = {
  ...BASE,
  screenplay_print_scene_numbers: "both",
  screenplay_print_scene_identifiers: true,
  screenplay_print_branch_identifiers: true,
  screenplay_print_function_identifiers: true,
};

const FUNCTION_SCRIPT = [
  "scene with_function",
  "  $: INT. WORKSHOP - DAY",
  "  function greet()",
  "    GUIDE:",
  "      Hello there.",
  "  end",
  "  Afterwards.",
  "end",
  "",
].join("\n");

const LONG_PARENTHETICAL = [
  "scene long_parenthetical",
  "  GUIDE:",
  "    (speaking slowly and carefully, as if to someone who has never heard of a train before today)",
  "    Fine.",
  "end",
  "",
].join("\n");

const LONG_DUAL = [
  "scene long_dual",
  "  THEO [<]:",
  "    I take it back, every single word of it, and I mean that sincerely this time.",
  "  ZADIE [>]:",
  "    Best. Night. Ever. Nobody will ever believe a word of what happened here tonight.",
  "  MARCUS:",
  "    Afterwards.",
  "end",
  "",
].join("\n");

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

const PAPER: Record<string, { left: number; right: number; cell: number }> = {
  usletter: { left: 1.5 * 72, right: (8.5 - 1) * 72, cell: (1228 / 2048) * 12 },
  a4: { left: 1.5 * 72, right: (8.27 - 1) * 72, cell: (1228 / 2048) * 12 },
};

interface Row {
  text: string;
  left: number;
  top: number;
  page: number;
}

interface Numbers {
  left: (string | number)[];
  right: (string | number)[];
}

interface Printed {
  rows: Row[];
  numbers: Numbers;
  rowHeight: number;
  rowInches: number;
  names?: { text: string; weight: string; decoration: string; muted: boolean }[];
}

const spaced = (pieces: { text: string; x: number; width: number }[], cell: number) => {
  const sorted = [...pieces].sort((a, b) => a.x - b.x);
  const inked = sorted.find((piece) => piece.text.trim())!;
  const lead = inked.text.length - inked.text.trimStart().length;
  const left = inked.x + lead * cell;
  const columns: string[] = [];
  for (const piece of sorted) {
    const start = Math.round((piece.x - left) / cell);
    Array.from(piece.text).forEach((character, index) => {
      if (character.trim() && start + index >= 0) columns[start + index] = character;
    });
  }
  return { text: Array.from(columns, (character) => character ?? " ").join("").trim(), left };
};

const printed = async (script: string, config: ScreenplayConfig, fonts: Record<string, ArrayBuffer> = FONTS): Promise<Printed> => {
  const { buildPDF } = await import(pathToFileURL(resolve(__dirname, "../../sparkdown-screenplay-pdf/src/buildPDF.ts")).href);
  const paper = PAPER[config.screenplay_print_paper_size ?? "usletter"]!;
  const draws: { text: string; x: number; y: number; width: number; page: number }[] = [];
  const pages: unknown[] = [];
  const prototype = PDFDocument.prototype as unknown as { text: (...args: unknown[]) => unknown };
  const text = prototype.text;
  const spy = vi.spyOn(prototype, "text").mockImplementation(function (this: PDFKit.PDFDocument, ...args: unknown[]) {
    const [value, x, y] = args as [unknown, number, number];
    if (typeof value === "string" && typeof x === "number" && typeof y === "number" && value.length > 0) {
      const current = (this as unknown as { page: unknown }).page;
      if (!pages.includes(current)) pages.push(current);
      draws.push({ text: value, x, y, width: this.widthOfString(value), page: pages.indexOf(current) });
    }
    return text.apply(this, args);
  });
  try {
    await buildPDF([script], config, fonts);
  } finally {
    spy.mockRestore();
  }
  const numbers: Numbers = { left: [], right: [] };
  const byRow = new Map<string, typeof draws>();
  for (const draw of draws) {
    if (/^\d+$/.test(draw.text) && draw.x + draw.width <= paper.left - 3.5 * paper.cell) {
      numbers.left.push(`${draw.text}@${((draw.x + draw.width - paper.left) / paper.cell).toFixed(2)}`);
      continue;
    }
    if (/^\d+$/.test(draw.text) && draw.x >= paper.right + 0.5 * paper.cell) {
      numbers.right.push(`${draw.text}@${((draw.x - paper.right) / paper.cell).toFixed(2)}`);
      continue;
    }
    const key = `${draw.page}:${draw.y.toFixed(2)}`;
    byRow.set(key, [...(byRow.get(key) ?? []), draw]);
  }
  const rows = [...byRow.values()]
    .map((pieces) => {
      const { text, left } = spaced(pieces, paper.cell);
      return { text, left: (left - paper.left) / paper.cell, top: pieces[0]!.y, page: pieces[0]!.page };
    })
    .filter((row) => row.text)
    .sort((a, b) => a.page - b.page || a.top - b.top);
  const steps = rows.slice(1).map((row, index) => row.top - rows[index]!.top).filter((step) => step > 0.5);
  const rowHeight = Math.min(...steps);
  return { rows, numbers, rowHeight, rowInches: rowHeight / 72 };
};

let browser: Browser;
let pageUrl: string;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "screenplay-geometry-"));
  pageUrl = await buildScreenplayGeometryPage(outDir);
  browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  rmSync(outDir, { recursive: true, force: true });
});

const drawn = async (script: string, config: ScreenplayConfig, width: number, scenesBefore = 0): Promise<Printed> => {
  const page = await browser.newPage({ viewport: { width: width + 40, height: 6000 } });
  await page.route(EMOJI_FONT_URL, (route) =>
    route.fulfill({ body: readFileSync(resolve(FONT_DIR, "noto-color-emoji.ttf")), contentType: "font/ttf", headers: { "Access-Control-Allow-Origin": "*" } }),
  );
  await page.goto(pageUrl);
  await page.waitForFunction(() => "renderScreenplay" in window);
  await page.evaluate(() =>
    Promise.all(["normal", "bold", "italic", "bold italic"].map((face) => document.fonts.load(`${face} 12px "Courier Prime"`))),
  );
  await page.evaluate(
    ([text, settings, before, w]) =>
      (window as unknown as { renderScreenplay: (...args: unknown[]) => void }).renderScreenplay("fixture", text, settings, before, w),
    [script, config, scenesBefore, width] as const,
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const result = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>(".cm-content")!;
    const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
    const probe = scroller.appendChild(document.createElement("span"));
    probe.style.whiteSpace = "pre";
    probe.textContent = "0".repeat(100);
    const cell = probe.getBoundingClientRect().width / 100;
    const fontSize = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    if (Math.abs(cell / fontSize - 1228 / 2048) > 0.001) throw new Error(`the page is not drawn in Courier Prime: a character is ${cell / fontSize} em`);
    const origin = content.getBoundingClientRect().left;
    const shown = (element: Element | null): boolean => {
      for (let node = element; node && node !== content; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      }
      return true;
    };
    const glyphs: { character: string; left: number; right: number; top: number }[] = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (!shown(node.parentElement)) continue;
      for (let index = 0; index < node.length; index++) {
        const character = node.data[index]!;
        if (!character.trim() || /[\uD800-\uDFFF‍︀-️]/.test(character)) continue;
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = Array.from(range.getClientRects()).find((box) => box.width > 0);
        if (rect) glyphs.push({ character, left: rect.left, right: rect.right, top: Math.round(rect.top) });
      }
    }
    const byTop = new Map<number, typeof glyphs>();
    for (const glyph of glyphs) byTop.set(glyph.top, [...(byTop.get(glyph.top) ?? []), glyph]);
    const rows = [...byTop.entries()]
      .sort(([a], [b]) => a - b)
      .map(([top, row]) => {
        row.sort((a, b) => a.left - b.left);
        const columns: string[] = [];
        for (const glyph of row) columns[Math.round((glyph.left - row[0]!.left) / cell)] ??= glyph.character;
        const text = Array.from(columns, (character) => character ?? " ").join("");
        return { text, left: (row[0]!.left - origin) / cell, top, page: 0 };
      });
    const numbers: { left: string[]; right: string[] } = { left: [], right: [] };
    const right = content.getBoundingClientRect().right;
    for (const heading of Array.from(content.querySelectorAll<HTMLElement>(".sp-heading"))) {
      for (const [pseudo, side] of [
        ["::before", "left"],
        ["::after", "right"],
      ] as const) {
        const style = getComputedStyle(heading, pseudo);
        if (style.content === "none" || style.content === "normal" || style.display === "none") continue;
        const box = heading.getBoundingClientRect();
        const number = heading.dataset["sceneNumber"]!;
        if (side === "left") {
          const edge = box.right - parseFloat(style.right);
          numbers.left.push(`${number}@${((edge - origin) / cell).toFixed(2)}`);
        } else {
          const edge = box.left + parseFloat(style.left);
          numbers.right.push(`${number}@${((edge - right) / cell).toFixed(2)}`);
        }
      }
    }
    const line = content.querySelector<HTMLElement>(".cm-line")!;
    const rowHeight = parseFloat(getComputedStyle(line).lineHeight) || line.getBoundingClientRect().height;
    const muted = getComputedStyle(content).getPropertyValue("--sp-muted");
    const probeMuted = content.appendChild(document.createElement("span"));
    probeMuted.style.color = muted || "transparent";
    const mutedColor = getComputedStyle(probeMuted).color;
    probeMuted.remove();
    const names = Array.from(content.querySelectorAll<HTMLElement>(".sp-name")).map((name) => {
      const style = getComputedStyle(name);
      return { text: name.textContent ?? "", weight: style.fontWeight, decoration: style.textDecorationLine, muted: style.color === mutedColor };
    });
    return { rows, numbers, names, rowHeight, rowInches: rowHeight / (cell / (((1228 / 2048) * 12) / 72)) };
  });
  await page.close();
  return result;
};

const near = (a: number, b: number) => Math.abs(a - b) < 0.06;

const compare = (page: Printed, pdf: Printed) => {
  const differences: string[] = [];
  if (Math.abs(page.rowInches - pdf.rowInches) > 0.002) {
    differences.push(`row pitch: page ${page.rowInches.toFixed(4)} in, PDF ${pdf.rowInches.toFixed(4)} in`);
  }
  const count = Math.max(page.rows.length, pdf.rows.length);
  for (let index = 0; index < count; index++) {
    const shown = page.rows[index];
    const print = pdf.rows[index];
    if (!shown || !print || shown.text !== print.text || !near(shown.left, print.left)) {
      differences.push(
        `row ${index}: page ${shown ? `${JSON.stringify(shown.text)} at ${shown.left.toFixed(2)}` : "none"}, PDF ${print ? `${JSON.stringify(print.text)} at ${print.left.toFixed(2)}` : "none"}`,
      );
      break;
    }
  }
  for (let index = 1; index < Math.min(page.rows.length, pdf.rows.length); index++) {
    const before = pdf.rows[index - 1]!;
    const after = pdf.rows[index]!;
    if (before.page !== after.page) continue;
    const pdfStep = Math.round((after.top - before.top) / pdf.rowHeight);
    const pageStep = Math.round((page.rows[index]!.top - page.rows[index - 1]!.top) / page.rowHeight);
    if (pdfStep !== pageStep) {
      differences.push(`rows from ${JSON.stringify(before.text)} to ${JSON.stringify(after.text)}: page ${pageStep} rows down, PDF ${pdfStep}`);
      break;
    }
  }
  return differences;
};

const WIDTHS = [320, 430, 560, 760];

describe("the Screenplay page draws every row where the PDF prints it", () => {
  it.each(DEMO.flatMap((name) => ["usletter", "a4"].map((paper) => [name, paper] as const)))(
    "for %s on %s at every pane width",
    async (name, paper) => {
      const script = fixture(name);
      const config = { ...BASE, screenplay_print_paper_size: paper };
      const pdf = await printed(script, config);
      for (const width of WIDTHS) {
        expect(compare(await drawn(script, config, width), pdf), `${width}px`).toEqual([]);
      }
    },
    240_000,
  );

  it.each([
    ["a long parenthetical", LONG_PARENTHETICAL],
    ["long dual dialogue", LONG_DUAL],
    ["a function", FUNCTION_SCRIPT],
  ])("for %s", async (_name, script) => {
    const pdf = await printed(script, NAMED);
    expect(compare(await drawn(script, NAMED, 560), pdf)).toEqual([]);
  }, 120_000);

  it.each(DEMO)("with names and scene numbers on both sides for %s", async (name) => {
    const script = fixture(name);
    const pdf = await printed(script, NAMED);
    const page = await drawn(script, NAMED, 560);
    expect(compare(page, pdf)).toEqual([]);
    expect(page.numbers).toEqual(pdf.numbers);
    expect(page.names?.length).toBeGreaterThan(0);
    for (const name of page.names ?? []) expect(name, name.text).toMatchObject({ weight: "400", decoration: "none", muted: true });
  }, 120_000);

  it("numbers scenes after the scenes of the scripts printed before this one", async () => {
    const before = fixture("chapter_1.sd");
    const script = fixture("chapter_2.sd");
    const pdf = await printed(`${before}\n\n${script}`, NAMED);
    const scenesBefore = (await printed(before, NAMED)).numbers.left.length;
    const page = await drawn(script, NAMED, 560, scenesBefore);
    const tail = (numbers: (string | number)[]) => numbers.slice(-page.numbers.left.length);
    expect(page.numbers.left.length).toBeGreaterThan(0);
    expect(page.numbers.left).toEqual(tail(pdf.numbers.left));
    expect(page.numbers.right).toEqual(tail(pdf.numbers.right));
  }, 120_000);
});

const LONG = "The reader sees these words and keeps on reading them all the way to the far edge of a long line that must wrap.";

const WRAPPING_KINDS: Record<string, string[]> = {
  ImplicitAction: [`  ${LONG}`],
  BlockAction: ["  :", `    ${LONG}`],
  InlineDialogue: [`  GUIDE: ${LONG}`],
  BlockDialogue: ["  GUIDE:", `    (${LONG})`, `    ${LONG}`],
  DualDialogue: ["  GUIDE [<]:", `    ${LONG}`, "  VISITOR [>]:", `    (${LONG})`, `    ${LONG}`],
  InlineHeading: [`  $: INT. ${LONG.toUpperCase()}`],
  InlineTransitional: [`  %: ${LONG.toUpperCase()}`],
  InlineTitle: [`  ^: ${LONG.toUpperCase()}`],
  Choice: [`  * [${LONG}]`],
  AlternatorArm: ["  queue", `    | ${LONG}`, `    | GUIDE: ${LONG}`, "  end"],
  GluedAlternator: [`  They see .. queue | ${LONG} | a dog .. outside.`],
  Interpolation: [`  ${LONG.slice(0, 50)} {person} ${LONG.slice(50)}`],
};

const MATRIX_CHUNK = 8;

const sequences = (kinds: Record<string, string[]>) => {
  const names = Object.keys(kinds);
  return Array.from({ length: Math.ceil(names.length / MATRIX_CHUNK) }, (_, index) =>
    names.slice(index * MATRIX_CHUNK, (index + 1) * MATRIX_CHUNK),
  ).map((chunk) => ({
    chunk,
    source: ["scene s", "  GUIDE: Before.", ...chunk.flatMap((kind) => kinds[kind]!), "  After.", "end", ""].join("\n"),
  }));
};

describe("the parity matrix's rows sit and wrap where the PDF prints them", () => {
  it.each([
    ["default", BASE],
    ["names and numbers", NAMED],
  ] as const)("for every element kind with %s settings", async (_name, config) => {
    const failures: string[] = [];
    for (const { chunk, source } of [...sequences(KINDS), ...sequences(WRAPPING_KINDS)]) {
      const found = compare(await drawn(source, config, 560), await printed(source, config));
      if (found.length) failures.push(`${chunk.join(" > ")}: ${found.join("; ")}`);
    }
    expect(failures).toEqual([]);
  }, 600_000);
});

const TITLE_PAGE = [
  "---",
  "title:",
  "  **The Midnight Jukebox**",
  "  A Sparkdown demo story",
  "credit: Written by",
  "author: The Lantern Street Writers",
  "source: An original story made for the editor redesign",
  "notes:",
  "  *Chapter 1 references a missing sound and chapter 2 has a typo, on purpose, so the editor has problems to show.*",
  "date: September 23, 2026",
  "contact:",
  "  Impower Games",
  "revision: Draft 1",
  "---",
  "",
  "scene s",
  "  Hello.",
  "end",
  "",
].join("\n");

const TITLE_STEPS: [string, string][] = [
  ["The Midnight Jukebox", "A Sparkdown demo story"],
  ["A Sparkdown demo story", "Written by"],
  ["Written by", "The Lantern Street Writers"],
  ["The Lantern Street Writers", "An original story"],
  ["September 23, 2026", "Chapter 1 references"],
  ["Chapter 1 references", "Impower Games"],
  ["Impower Games", "Draft 1"],
];

describe("the title page", () => {
  it("spaces its fields by the rows the PDF prints between them", async () => {
    const config = { ...BASE, screenplay_print_title_page: true };
    const pdf = await printed(TITLE_PAGE, config);
    const page = await drawn(TITLE_PAGE, config, 760);
    const step = (found: Printed, [from, to]: [string, string]) => {
      const first = found.rows.find((row) => row.text.includes(from));
      const second = found.rows.find((row) => row.text.includes(to));
      return first && second ? Math.round((second.top - first.top) / found.rowHeight) : undefined;
    };
    const differences = TITLE_STEPS.map((pair) => ({ pair, page: step(page, pair), pdf: step(pdf, pair) })).filter(
      (found) => found.pdf === undefined || found.page !== found.pdf,
    );
    expect(differences).toEqual([]);
  }, 120_000);
});

const EMOJI_SCRIPT = [
  "scene emoji",
  "  GUIDE:",
  `    ${"a ".repeat(15)}${"\u{1F642} ".repeat(6)}tail finish.`,
  `  Then ${"\u{1F44D}\u{1F3FD} ".repeat(8)}they all wave goodbye to the train as it leaves the station.`,
  "end",
  "",
].join("\n");

const LONG_BRANCH = ["scene long_branch", "  Before.", "end", "", `branch ${"identifier".repeat(8)}`, "  Inside.", "end", ""].join("\n");

describe("rows the reviewer found wrapping differently", () => {
  it("wraps rows holding emoji where the PDF wraps them", async () => {
    const pdf = await printed(EMOJI_SCRIPT, BASE, { ...FONTS, emoji: readFont("noto-color-emoji.ttf") });
    expect(compare(await drawn(EMOJI_SCRIPT, BASE, 560), pdf)).toEqual([]);
  }, 120_000);

  it("wraps a long branch name where the PDF wraps it", async () => {
    const pdf = await printed(LONG_BRANCH, NAMED);
    expect(compare(await drawn(LONG_BRANCH, NAMED, 760), pdf)).toEqual([]);
  }, 120_000);
});

const TITLE_MARKUP = ["---", "title: long title about a mysterious trip to the city called **night**fall", "---", "", "scene s", "  Hello.", "end", ""].join("\n");

describe("the title page's rows", () => {
  it.each([
    ["the demo title page", TITLE_PAGE],
    ["a title whose emphasis ends inside a word", TITLE_MARKUP],
  ])("break and sit where the PDF prints them for %s", async (_name, script) => {
    const config = { ...BASE, screenplay_print_title_page: true };
    const pdf = await printed(script, config);
    const differences: string[] = [];
    for (const width of [320, 560, 760]) {
      const page = await drawn(script, config, width);
      for (const row of pdf.rows.filter((found) => found.page === 0)) {
        const shown = page.rows.find((found) => found.text === row.text);
        if (!shown || !near(shown.left, row.left)) {
          differences.push(`${width}px: PDF ${JSON.stringify(row.text)} at ${row.left.toFixed(2)}, page ${shown ? shown.left.toFixed(2) : "none"}`);
        }
      }
    }
    expect(differences).toEqual([]);
  }, 120_000);
});

const COMBINING_SCRIPT = ["scene combining", "  GUIDE:", `    ${"é ".repeat(32)}finish.`, "  After.", "end", ""].join("\n");

describe("rows holding combining marks", () => {
  it("break where the PDF breaks them, the PDF giving each mark its own character", async () => {
    const pdf = await printed(COMBINING_SCRIPT, BASE);
    const page = await drawn(COMBINING_SCRIPT, BASE, 560);
    const letters = (found: Printed) =>
      found.rows.map((row) => ({ text: row.text.replace(/[̀-ͯ\s]/g, ""), left: row.left }));
    const shown = letters(page);
    const print = letters(pdf);
    expect(shown.map((row) => row.text)).toEqual(print.map((row) => row.text));
    shown.forEach((row, index) => expect(Math.abs(row.left - print[index]!.left), row.text).toBeLessThan(0.06));
  }, 120_000);
});
