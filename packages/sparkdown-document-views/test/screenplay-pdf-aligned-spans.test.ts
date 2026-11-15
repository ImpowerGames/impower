// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";

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

const PDF_SOURCE = resolve(__dirname, "../../sparkdown-screenplay-pdf/src");

const load = (path: string) => import(pathToFileURL(resolve(PDF_SOURCE, path)).href);

interface Run {
  text: string;
  align?: string;
}

interface Line {
  content: Run[];
}

interface Printer {
  printText(text: string | Run[], x: number, y: number, ...rest: unknown[]): number;
  printLine(span: Line): number;
  getHeightOfLine(span: Line): number;
}

interface Printed {
  runs: Run[];
  y: number;
}

const printPdf = async (script: string, config: ScreenplayConfig) => {
  const [{ buildPDF }, { default: ScreenplayPrinter }] = await Promise.all([
    load("buildPDF.ts"),
    load("classes/ScreenplayPrinter.ts"),
  ]);
  const printer = ScreenplayPrinter.prototype as Printer;
  const printed: Printed[] = [];
  const lines: { expected: number; actual: number }[] = [];
  const printText = printer.printText;
  const printLine = printer.printLine;
  const textSpy = vi.spyOn(printer, "printText").mockImplementation(function (this: Printer, text, x, y, ...rest) {
    printed.push({ runs: typeof text === "string" ? [{ text }] : text.map((c) => ({ text: c.text, align: c.align })), y });
    return printText.call(this, text, x, y, ...rest);
  });
  const lineSpy = vi.spyOn(printer, "printLine").mockImplementation(function (this: Printer, span) {
    const expected = this.getHeightOfLine(span);
    const actual = printLine.call(this, span);
    if (span.content.some((c) => c.align)) lines.push({ expected, actual });
    return actual;
  });
  try {
    await buildPDF([script], config, FONTS);
  } finally {
    textSpy.mockRestore();
    lineSpy.mockRestore();
  }
  return { printed, lines };
};

const compact = (text: string) => text.replace(/\s+/g, "");

const BODY: ScreenplayConfig = { screenplay_print_title_page: false };

const scene = (...lines: string[]) => ["scene s", "  Before.", ...lines, "  After.", "end", ""].join("\n");

const CASES: [string, string, string[], string][] = [
  ["a centred span at the start of a line", scene("  ^Up^ they go."), ["Up"], "Before.Up they go.After."],
  ["a centred span in the middle of a line", scene("  They ^go^ on."), ["go"], "Before.They go on.After."],
  ["a centred span at the end of a line", scene("  They go ^on^"), ["on"], "Before.They go on After."],
  ["two centred spans on one line", scene("  A ^b^ c ^d^ e."), ["b", "d"], "Before.A b c d e.After."],
  ["a centred span inside dialogue", scene("  GUIDE: Say ^hi^ now."), ["hi"], "Before.GUIDESay hi now.After."],
  [
    "the ticket's centred span inside a choice",
    scene("  choose", "    + Go **a** [_b_] ^c^ d", "      Done.", "  end"),
    ["c"],
    "Before.+ Go a [b] c dDone.After.",
  ],
];

describe("a centred span in the PDF export", () => {
  it.each(CASES)("prints every character of %s, in order", async (_name, script, centred, reading) => {
    const { printed, lines } = await printPdf(script, BODY);
    const text = printed.flatMap((p) => p.runs.map((r) => r.text)).join("");
    expect(compact(text)).toBe(compact(reading));
    expect(printed.flatMap((p) => p.runs.filter((r) => r.align === "center").map((r) => r.text.trim()))).toEqual(centred);
    expect(lines.length).toBeGreaterThan(0);
    for (const { expected, actual } of lines) expect(actual).toBe(expected);
  });

  it("puts the text after a centred span on the line below it", async () => {
    const { printed } = await printPdf(scene("  They ^go^ on."), BODY);
    const rows = printed.filter((p) => ["They", "go", "on."].includes(p.runs.map((r) => r.text).join("").trim()));
    expect(rows.map((p) => p.runs.map((r) => r.text).join("").trim())).toEqual(["They", "go", "on."]);
    expect(rows[0]!.y).toBeLessThan(rows[1]!.y);
    expect(rows[1]!.y).toBeLessThan(rows[2]!.y);
  });

  it("prints a centred span in a title page field", async () => {
    const script = ["---", "title: The ^Big^ Heist", "---", "", scene("  They go.")].join("\n");
    const { printed } = await printPdf(script, { screenplay_print_title_page: true });
    const text = compact(printed.flatMap((p) => p.runs.map((r) => r.text)).join(""));
    expect(text).toContain(compact("The Big Heist"));
  });
});
