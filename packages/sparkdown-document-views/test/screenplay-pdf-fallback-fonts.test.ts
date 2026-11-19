// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_FONT_SOURCES, type FallbackFontFaces } from "../../sparkdown-screenplay-pdf/src/utils/fallbackFontSources";
import { loadFallbackFonts } from "../../sparkdown-screenplay-pdf/src/utils/loadFallbackFonts";

const FONT_DIR = resolve(__dirname, "../../../impower-dev/src/public/fonts");
const FALLBACK_DIR = resolve(__dirname, "fixtures/fallback-fonts");

const bufferOf = (path: string): ArrayBuffer => {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const FONTS = {
  normal: bufferOf(resolve(FONT_DIR, "courier-prime.ttf")),
  bold: bufferOf(resolve(FONT_DIR, "courier-prime-bold.ttf")),
  italic: bufferOf(resolve(FONT_DIR, "courier-prime-italic.ttf")),
  bolditalic: bufferOf(resolve(FONT_DIR, "courier-prime-bold-italic.ttf")),
};

const fixturePath = (name: string, weight: string) => resolve(FALLBACK_DIR, `${name.toLowerCase().replace(/ /g, "-")}-${weight}.ttf`);

const FALLBACKS: FallbackFontFaces[] = FALLBACK_FONT_SOURCES.filter((source) => existsSync(fixturePath(source.name, "normal"))).map((source) => ({
  script: source.script,
  normal: bufferOf(fixturePath(source.name, "normal")),
  bold: bufferOf(fixturePath(source.name, "bold")),
}));

const scene = (...lines: string[]) => ["scene s", "  KEN:", ...lines.map((line) => `    ${line}`), "end", ""].join("\n");

interface Draw {
  text: string;
  y: number;
  baseline: number;
  covered: boolean;
  postscriptName: string;
  oblique: unknown;
}

const exportPdf = async (
  script: string,
  fallbacks: FallbackFontFaces[] = FALLBACKS,
): Promise<{ pdf: ArrayBuffer; unprintable: string[]; draws: Draw[] }> => {
  const { buildPDF } = await import(pathToFileURL(resolve(__dirname, "../../sparkdown-screenplay-pdf/src/buildPDF.ts")).href);
  const draws: Draw[] = [];
  const prototype = PDFDocument.prototype as unknown as { text: (...args: unknown[]) => unknown };
  const text = prototype.text;
  const spy = vi.spyOn(prototype, "text").mockImplementation(function (this: PDFKit.PDFDocument, ...args: unknown[]) {
    const [value, , y, options] = args as [unknown, number, number, { baseline?: string | number; oblique?: unknown } | undefined];
    if (typeof value === "string" && value.trim()) {
      const state = this as unknown as {
        _font: { ascender: number; font: { postscriptName: string; hasGlyphForCodePoint(codePoint: number): boolean } };
        _fontSize: number;
      };
      const drop =
        typeof options?.baseline === "number" ? -options.baseline : (state._font.ascender * state._fontSize) / 1000;
      draws.push({
        text: value,
        y,
        baseline: y + drop,
        covered: [...value.replace(/\s/g, "")].every((character) => state._font.font.hasGlyphForCodePoint(character.codePointAt(0)!)),
        postscriptName: state._font.font.postscriptName,
        oblique: options?.oblique,
      });
    }
    return text.apply(this, args);
  });
  try {
    const result = await buildPDF([script], { screenplay_print_title_page: false }, FONTS, undefined, fallbacks);
    return { ...result, draws };
  } finally {
    spy.mockRestore();
  }
};

const toUnicodeTargets = (pdf: ArrayBuffer) => {
  const source = Buffer.from(pdf).toString("latin1");
  const targets = new Set<string>();
  for (const cmap of source.matchAll(/begincmap([\s\S]*?)endcmap/g)) {
    for (const range of cmap[1]!.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const list of range[1]!.matchAll(/\[([^\]]*)\]/g)) {
        for (const hex of list[1]!.matchAll(/<([0-9a-f]+)>/gi)) {
          const units: number[] = [];
          for (let index = 0; index < hex[1]!.length; index += 4) units.push(parseInt(hex[1]!.slice(index, index + 4), 16));
          targets.add(String.fromCharCode(...units));
        }
      }
    }
  }
  return targets;
};

const SCRIPTS = "東京駅 これは カタカナ 기차가 नमस्ते Ω";

describe("the Screenplay PDF's fallback fonts", () => {
  it("draw Han, Hiragana, Katakana, Hangul, Devanagari and Greek capital Omega with a face that has them", async () => {
    const { pdf, unprintable, draws } = await exportPdf(scene(SCRIPTS));
    expect(unprintable).toEqual([]);
    const printed = draws.filter((draw) => /[^\x20-\x7e]/.test(draw.text));
    expect(printed.map((draw) => draw.text).join("")).toBe(SCRIPTS.replace(/ /g, ""));
    expect(printed.every((draw) => draw.covered)).toBe(true);
    expect(new Set(printed.map((draw) => draw.postscriptName))).toEqual(new Set(["NotoSansJP-Regular", "NotoSansKR-Regular", "NotoSans-Regular"]));
    const extracted = toUnicodeTargets(pdf);
    for (const character of SCRIPTS.replace(/ /g, "")) expect(extracted, character).toContain(character);
  });

  it("draw the marks Hiragana and Katakana share with the Japanese font", async () => {
    const { unprintable, draws } = await exportPdf(scene("スーパー・ガ"));
    expect(unprintable).toEqual([]);
    expect(draws.find((draw) => draw.text.includes("ー"))?.postscriptName).toBe("NotoSansJP-Regular");
  });

  it("keep characters Courier Prime has in Courier Prime", async () => {
    const { draws } = await exportPdf(scene("Ken waves at 東京 station."));
    expect(draws.filter((draw) => /[a-z]/i.test(draw.text)).every((draw) => draw.postscriptName.startsWith("CourierPrime"))).toBe(true);
  });

  it("set every run of a row on one baseline", async () => {
    const { draws } = await exportPdf(scene("Ken 東京 waves Ω 기차 back."));
    const rows = new Map<number, number[]>();
    for (const draw of draws) rows.set(draw.y, [...(rows.get(draw.y) ?? []), draw.baseline]);
    const mixed = [...rows.values()].filter((baselines) => baselines.length > 1);
    expect(mixed.length).toBeGreaterThan(0);
    for (const baselines of mixed) for (const baseline of baselines) expect(baseline).toBeCloseTo(baselines[0]!, 6);
  });

  it("draw bold text with the bold fallback and slant italic text", async () => {
    const { draws, unprintable } = await exportPdf(["scene s", "  **太字 Ω** *斜体 Ω* ***両方***", "end", ""].join("\n"));
    expect(unprintable).toEqual([]);
    const face = (text: string) => draws.find((draw) => draw.text === text)!;
    expect(face("太字").postscriptName).toBe("NotoSansJP-Bold");
    expect(face("斜体").postscriptName).toBe("NotoSansJP-Regular");
    expect(face("斜体").oblique).toBeGreaterThan(0);
    expect(face("両方").postscriptName).toBe("NotoSansJP-Bold");
    expect(face("両方").oblique).toBeGreaterThan(0);
    expect(face("太字").oblique).toBeFalsy();
  });

  it("leave right-to-left text to the warning and list only the characters no supplied font covers", async () => {
    const { unprintable } = await exportPdf(scene("東京 مرحبا שלום Ω 垓"));
    expect(unprintable).toEqual([..."مرحباשלום"]);
  });

  it("start the text after a shaped run where the run was measured to end, inside a span and across spans", async () => {
    const source = resolve(__dirname, "../../sparkdown-screenplay-pdf/src");
    const { printTextbox } = await import(pathToFileURL(resolve(source, "textbox-for-pdfkit/src/utils/printTextbox.ts")).href);
    const { registerFallbackFonts } = await import(pathToFileURL(resolve(source, "utils/fallbackFonts.ts")).href);
    const shaping = bufferOf(resolve(FONT_DIR, "noto-color-emoji.ttf"));
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    const endOf = (parts: { text: string; font: string }[]) => {
      const doc = new PDFDocument({ font: "", size: "LETTER" });
      const faces = { normal: FONTS.normal, bold: FONTS.bold };
      for (const [name, bytes] of Object.entries(faces)) doc.registerFont(name, bytes);
      registerFallbackFonts(doc, faces, [{ normal: shaping }]);
      doc.font("normal").fontSize(12);
      const xs = new Map<string, number>();
      const text = doc.text.bind(doc);
      vi.spyOn(doc, "text").mockImplementation(((value: string, x: number, ...rest: unknown[]) => {
        xs.set(value, x);
        return text(value, x, ...(rest as []));
      }) as typeof doc.text);
      printTextbox(doc, parts, 72, 72, 400, { baseline: "top" });
      return xs.get("END")!;
    };
    const joined = endOf([{ text: `${family}${family}END`, font: "normal" }]);
    const split = endOf([
      { text: `${family}${family}`, font: "normal" },
      { text: "END", font: "bold" },
    ]);
    expect(joined).toBeGreaterThan(72);
    expect(joined).toBeCloseTo(split, 6);
  });

  it("underline a row's fallback runs on the line its Courier runs are underlined on, end to end", async () => {
    const source = resolve(__dirname, "../../sparkdown-screenplay-pdf/src");
    const { printTextbox } = await import(pathToFileURL(resolve(source, "textbox-for-pdfkit/src/utils/printTextbox.ts")).href);
    const { registerFallbackFonts } = await import(pathToFileURL(resolve(source, "utils/fallbackFonts.ts")).href);
    const doc = new PDFDocument({ font: "", size: "LETTER" });
    const faces = { normal: FONTS.normal };
    doc.registerFont("normal", faces.normal);
    registerFallbackFonts(doc, faces, FALLBACKS);
    doc.font("normal").fontSize(12);
    const segments: { x: number; y: number }[] = [];
    const moveTo = doc.moveTo.bind(doc);
    vi.spyOn(doc, "moveTo").mockImplementation(((x: number, y: number) => {
      segments.push({ x, y });
      return moveTo(x, y);
    }) as typeof doc.moveTo);
    const lineTo = doc.lineTo.bind(doc);
    const ends: number[] = [];
    vi.spyOn(doc, "lineTo").mockImplementation(((x: number, y: number) => {
      ends.push(x);
      return lineTo(x, y);
    }) as typeof doc.lineTo);
    printTextbox(doc, [{ text: "Ken 東京駅 waves 기차", font: "normal", underline: true }], 72, 72, 400, { baseline: "top" });
    expect(segments.length).toBeGreaterThan(2);
    expect(new Set(segments.map((segment) => segment.y)).size).toBe(1);
    for (let index = 1; index < segments.length; index++) expect(segments[index]!.x).toBeCloseTo(ends[index - 1]!, 6);
  });

  it("print a watermark's characters with the fallback fonts too", async () => {
    const { buildPDF } = await import(pathToFileURL(resolve(__dirname, "../../sparkdown-screenplay-pdf/src/buildPDF.ts")).href);
    const watermarked: { text: string; postscriptName: string; end: number }[] = [];
    const prototype = PDFDocument.prototype as unknown as { text: (...args: unknown[]) => unknown };
    const text = prototype.text;
    const spy = vi.spyOn(prototype, "text").mockImplementation(function (this: PDFKit.PDFDocument, ...args: unknown[]) {
      const state = this as unknown as { _font: { font: { postscriptName: string } }; _fontSize: number };
      if (typeof args[0] === "string" && state._fontSize > 40) {
        watermarked.push({
          text: args[0],
          postscriptName: state._font.font.postscriptName,
          end: (args[1] as number) + this.widthOfString(args[0]),
        });
      }
      return text.apply(this, args);
    });
    try {
      const script = ["---", "title: Ken", "watermark: 東京 DRAFT", "---", "", "scene s", "  Hello.", "end", ""].join("\n");
      const { unprintable } = await buildPDF([script], { screenplay_print_title_page: true }, FONTS, undefined, FALLBACKS);
      expect(unprintable).toEqual([]);
    } finally {
      spy.mockRestore();
    }
    expect(watermarked.map((draw) => draw.text).join("")).toBe("東京 DRAFT");
    expect(watermarked.find((draw) => draw.text === "東京")?.postscriptName).toMatch(/^NotoSans(JP|SC)-/);
    const diagonal = Math.hypot(8.5, 11) - 4;
    const courierEnd = (2 + (1.667 * diagonal * 1228) / 2048) * 72;
    expect(watermarked.at(-1)!.end).toBeCloseTo(courierEnd, 1);
  });

  it("skip a fallback font that cannot be read and list what it would have drawn", async () => {
    const { unprintable } = await exportPdf(scene("東京 Ω"), [{ normal: new ArrayBuffer(16) }, FALLBACKS[0]!]);
    expect(unprintable).toEqual(["東", "京"]);
  });
});

describe("the fallback fonts an export fetches", () => {
  const fetched = async (scripts: string[], failing: string[] = []) => {
    const urls: string[] = [];
    const families = await loadFallbackFonts(scripts, async (url) => {
      urls.push(url);
      if (failing.includes(url)) throw new Error("offline");
      const source = FALLBACK_FONT_SOURCES.find((candidate) => candidate.normal === url || candidate.bold === url)!;
      const path = fixturePath(source.name, url === source.bold ? "bold" : "normal");
      return existsSync(path) ? bufferOf(path) : new ArrayBuffer(8);
    });
    const names = (list: string[]) =>
      FALLBACK_FONT_SOURCES.filter((source) => list.includes(source.normal)).map((source) => source.name);
    return { names: names(urls), families };
  };

  it("fetch nothing for a script Courier Prime covers or for right-to-left text", async () => {
    expect((await fetched([scene("Café, naïve façade — “quoted” ½ Жук")])).names).toEqual([]);
    expect((await fetched([scene("مرحبا بالعالم שלום עולם")])).names).toEqual([]);
  });

  it("fetch the font for each script the text uses, with Japanese forms when it has kana", async () => {
    expect((await fetched([scene("これは東京駅です。")])).names).toEqual(["Noto Sans JP"]);
    expect((await fetched([scene("我们在火车站。")])).names).toEqual(["Noto Sans SC"]);
    expect((await fetched([scene("서울역 漢字")])).names).toEqual(["Noto Sans KR"]);
    expect((await fetched([scene("Ω नमस्ते")])).names).toEqual(["Noto Sans"]);
    expect((await fetched([scene("Ω"), scene("東京")])).names).toEqual(["Noto Sans", "Noto Sans SC"]);
  });

  it("read marks Hiragana and Katakana share as Japanese and punctuation Han shares as Chinese", async () => {
    expect((await fetched([scene("ーーー・・・")])).names).toEqual(["Noto Sans JP"]);
    expect((await fetched([scene("我们。、")])).names).toEqual(["Noto Sans SC"]);
    expect((await fetched([scene("。、")])).names).toEqual(["Noto Sans SC"]);
  });

  it("fetch the Chinese font too when the regional fonts lack a character", async () => {
    expect((await fetched([scene("これは我们の駅です。")])).names).toEqual(["Noto Sans JP", "Noto Sans SC"]);
    expect((await fetched([scene("기차가 我们")])).names).toEqual(["Noto Sans KR", "Noto Sans SC"]);
  });

  it("fetch both weights and drop a family whose regular face fails", async () => {
    const sans = FALLBACK_FONT_SOURCES.find((source) => source.name === "Noto Sans")!;
    const korean = FALLBACK_FONT_SOURCES.find((source) => source.name === "Noto Sans KR")!;
    const { names, families } = await fetched([scene("기차가 Ω")], [korean.normal, sans.bold]);
    expect(names).toEqual(["Noto Sans", "Noto Sans KR", "Noto Sans SC"]);
    expect(families).toHaveLength(2);
    expect(families[0]!.bold).toBeUndefined();
    expect(families[1]!.bold).toBeDefined();
  });
});
