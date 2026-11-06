// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import type { ScreenplayConfig } from "../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { generateScreenplayCsvData } from "../../sparkdown-screenplay/src/utils/generateScreenplayCsvData";
import { generateScreenplayHtmlData } from "../../sparkdown-screenplay/src/utils/generateScreenplayHtmlData";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";

const SCRIPT = `scene Opening:
  Hello there.

function SecretHelper()
  function NestedHelper()
    return 1
  end
  return NestedHelper()
end

local function LocalHelper()
  return 2
end

function Obj.MethodHelper()
  return 3
end

scene Closing:
  Goodbye.

function TrailingHelper()
  return 4
end
`;

const COMPACT_SCRIPT = `scene Opening:
  Hello there.
function FirstHelper()
  return 1
end
function SecondHelper()
  return 2
end
After the helpers.
function LastHelper()
  return 3
end`;

const localize = (script: string) =>
  script.replace(/^function (\w+)\(/gm, "local function $1(");

const ON: ScreenplayConfig = { screenplay_print_function_identifiers: true };
const OFF: ScreenplayConfig = { screenplay_print_function_identifiers: false };
const EXTENSION_DEFAULTS: ScreenplayConfig = {
  screenplay_print_function_identifiers: false,
  screenplay_print_scene_identifiers: false,
  screenplay_print_knot_identifiers: false,
  screenplay_print_stitch_identifiers: false,
  screenplay_print_scene_numbers: "none",
  screenplay_print_title_page: true,
  screenplay_print_paper_size: "usletter",
  screenplay_print_dialogue_split_across_pages: true,
  screenplay_print_dialogue_more: "(MORE)",
  screenplay_print_dialogue_contd: "(CONT'D)",
  screenplay_print_page_numbers: true,
  screenplay_print_bookmarks: true,
  screenplay_print_bookmarks_for_invisible_headings: true,
};

const readFont = (name: string): ArrayBuffer => {
  const bytes = readFileSync(
    resolve(__dirname, "../../../impower-dev/src/public/fonts", name),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
};

const FONTS = {
  normal: readFont("courier-prime.ttf"),
  bold: readFont("courier-prime-bold.ttf"),
  italic: readFont("courier-prime-italic.ttf"),
  bolditalic: readFont("courier-prime-bold-italic.ttf"),
};

type PrintedText = string | { text: string }[];

interface PdfModules {
  buildPDF: (
    scripts: string[],
    config: ScreenplayConfig | undefined,
    fonts: typeof FONTS,
  ) => Promise<ArrayBuffer>;
  printer: { printText: (text: PrintedText, ...rest: unknown[]) => number };
}

const PDF_SOURCE = resolve(__dirname, "../../sparkdown-screenplay-pdf/src");

const loadPdfModules = async (): Promise<PdfModules> => {
  const load = (path: string) =>
    import(pathToFileURL(resolve(PDF_SOURCE, path)).href);
  const [{ buildPDF }, { default: ScreenplayPrinter }] = await Promise.all([
    load("buildPDF.ts"),
    load("classes/ScreenplayPrinter.ts"),
  ]);
  return { buildPDF, printer: ScreenplayPrinter.prototype };
};

const buildPDF: PdfModules["buildPDF"] = async (...args) =>
  (await loadPdfModules()).buildPDF(...args);

const html = (script: string, config?: ScreenplayConfig) =>
  generateScreenplayHtmlData(new ScreenplayParser().parse(script), config);

const printedPdfText = async (script: string, config?: ScreenplayConfig) => {
  const printed: string[] = [];
  const { printer } = await loadPdfModules();
  const original = printer.printText;
  const spy = vi
    .spyOn(printer, "printText")
    .mockImplementation(function (this: unknown, text, ...rest) {
      printed.push(
        typeof text === "string" ? text : text.map((c) => c.text).join(""),
      );
      return original.call(this, text, ...rest);
    });
  try {
    await buildPDF([script], config, FONTS);
  } finally {
    spy.mockRestore();
  }
  return printed.join("\n");
};

const pdfBytes = async (script: string, config?: ScreenplayConfig) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  try {
    return new Uint8Array(await buildPDF([script], config, FONTS));
  } finally {
    vi.useRealTimers();
  }
};

const outlineTitles = (pdf: Uint8Array): string[] =>
  [
    ...Buffer.from(pdf)
      .toString("latin1")
      .matchAll(/\/Title <([0-9a-fA-F]+)>|\/Title \(([^)]*)\)/g),
  ].map((m) => {
    if (m[1] == null) {
      return m[2] ?? "";
    }
    const bytes = Buffer.from(m[1], "hex");
    return bytes[0] === 0xfe && bytes[1] === 0xff
      ? Buffer.from(bytes.subarray(2)).swap16().toString("utf16le")
      : bytes.toString("latin1");
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("screenplay function identifiers", () => {
  it("HTML export prints root function names only when the setting is on", () => {
    const on = html(SCRIPT, ON);
    const off = html(SCRIPT, OFF);
    expect(on).toContain("SecretHelper");
    expect(on).toContain("TrailingHelper");
    expect(off).not.toContain("SecretHelper");
    expect(off).not.toContain("TrailingHelper");
  });

  it("HTML export never prints nested, local or method function names", () => {
    const on = html(SCRIPT, ON);
    expect(on).not.toContain("NestedHelper");
    expect(on).not.toContain("LocalHelper");
    expect(on).not.toContain("MethodHelper");
  });

  it("PDF export prints root function names only when the setting is on", async () => {
    const on = await printedPdfText(SCRIPT, ON);
    const off = await printedPdfText(SCRIPT, OFF);
    expect(on).toContain("SecretHelper");
    expect(on).toContain("TrailingHelper");
    expect(on).not.toContain("NestedHelper");
    expect(on).not.toContain("LocalHelper");
    expect(on).not.toContain("MethodHelper");
    expect(off).not.toContain("SecretHelper");
    expect(off).not.toContain("TrailingHelper");
  });

  it("PDF bookmarks a root function name only when it is printed", async () => {
    const on = outlineTitles(
      await pdfBytes(SCRIPT, {
        ...EXTENSION_DEFAULTS,
        screenplay_print_function_identifiers: true,
      }),
    );
    const off = outlineTitles(await pdfBytes(SCRIPT, EXTENSION_DEFAULTS));
    expect(on).toContain("SecretHelper");
    expect(on).toContain("TrailingHelper");
    expect(on).not.toContain("NestedHelper");
    expect(off).toContain("Opening");
    expect(off).not.toContain("SecretHelper");
    expect(off).not.toContain("TrailingHelper");
  });

  it("prints a root function name where its definition sits", () => {
    const on = html(SCRIPT, ON);
    const opening = on.indexOf("Hello there.");
    const secret = on.indexOf("SecretHelper");
    const closing = on.indexOf("Goodbye.");
    const trailing = on.indexOf("TrailingHelper");
    expect(opening).toBeGreaterThan(-1);
    expect(secret).toBeGreaterThan(opening);
    expect(closing).toBeGreaterThan(secret);
    expect(trailing).toBeGreaterThan(closing);
  });

  it("prints compact root function names in order", () => {
    const on = html(COMPACT_SCRIPT, ON);
    const first = on.indexOf("FirstHelper");
    const second = on.indexOf("SecondHelper");
    const after = on.indexOf("After the helpers.");
    const last = on.indexOf("LastHelper");
    expect(first).toBeGreaterThan(on.indexOf("Hello there."));
    expect(second).toBeGreaterThan(first);
    expect(after).toBeGreaterThan(second);
    expect(last).toBeGreaterThan(after);
  });

  it.each([
    ["spaced", SCRIPT],
    ["compact", COMPACT_SCRIPT],
  ])(
    "only function tokens are added, so reading copy and CSV are unchanged (%s)",
    (_, script) => {
      const parser = new ScreenplayParser();
      const tokens = parser.parse(script);
      const localized = parser.parse(localize(script));
      expect(tokens.some((t) => t.tag === "function")).toBe(true);
      expect(tokens.filter((t) => t.tag !== "function")).toEqual(localized);
      expect(generateScreenplayReadingCopy(tokens)).toBe(
        generateScreenplayReadingCopy(localized),
      );
      expect(generateScreenplayCsvData(tokens)).toEqual(
        generateScreenplayCsvData(localized),
      );
    },
  );

  it.each([
    ["spaced", SCRIPT],
    ["compact", COMPACT_SCRIPT],
  ])(
    "default HTML output is unchanged by root function definitions (%s)",
    (_, script) => {
      expect(localize(script)).not.toBe(script);
      expect(html(script)).toBe(html(localize(script)));
      expect(html(script, OFF)).toBe(html(localize(script), OFF));
    },
  );

  it.each([
    ["spaced", SCRIPT, undefined],
    ["compact", COMPACT_SCRIPT, undefined],
    ["spaced, extension defaults", SCRIPT, EXTENSION_DEFAULTS],
    ["compact, extension defaults", COMPACT_SCRIPT, EXTENSION_DEFAULTS],
  ])(
    "default PDF output is unchanged by root function definitions (%s)",
    async (_, script, config) => {
      const actual = await pdfBytes(script, config);
      const expected = await pdfBytes(localize(script), config);
      expect(actual.length).toBeGreaterThan(0);
      expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
    },
  );
});
