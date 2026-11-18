// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const FONT_DIR = resolve(__dirname, "../../../impower-dev/src/public/fonts");

const readFont = (name: string): ArrayBuffer => {
  const bytes = readFileSync(resolve(FONT_DIR, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const fonts = (emoji = true) => ({
  normal: readFont("courier-prime.ttf"),
  bold: readFont("courier-prime-bold.ttf"),
  italic: readFont("courier-prime-italic.ttf"),
  bolditalic: readFont("courier-prime-bold-italic.ttf"),
  ...(emoji ? { emoji: readFont("noto-color-emoji.ttf") } : {}),
});

const PDF_SOURCE = resolve(__dirname, "../../sparkdown-screenplay-pdf/src");

const load = (path: string) => import(pathToFileURL(resolve(PDF_SOURCE, path)).href);

const ACUTE = String.fromCodePoint(0x301);
const DOTTED_CIRCLE = String.fromCodePoint(0x25cc);
const ASTRAL_HAN = String.fromCodePoint(0x20000);

const scene = (...lines: string[]) => ["scene s", "  KEN:", ...lines.map((line) => `    ${line}`), "end", ""].join("\n");

const exportPdf = async (script: string, emoji = true): Promise<{ pdf: ArrayBuffer; unprintable: string[] }> => {
  const { buildPDF } = await load("buildPDF.ts");
  return buildPDF([script], { screenplay_print_title_page: false }, fonts(emoji));
};

describe("the Screenplay PDF export's unprintable characters", () => {
  it("names each character the printing face lacks, once, in the order written", async () => {
    const script = scene(`部屋 こんにちは世界 안녕하세요 مرحبا नमस्ते Ω café e${ACUTE} ${ASTRAL_HAN} 世界`);
    const { pdf, unprintable } = await exportPdf(script);
    expect(pdf.byteLength).toBeGreaterThan(0);
    const expected = [..."部屋こんにちは世界안녕하세요مرحباनमस्ते", "Ω", ACUTE, ASTRAL_HAN];
    expect(unprintable).toEqual(expected.filter((c, i) => expected.indexOf(c) === i));
  });

  it("names nothing for a script the font covers, emoji included", async () => {
    const { unprintable } = await exportPdf(scene("Café, naïve façade — “quoted” ½ 😀 👍🏽", "The end."));
    expect(unprintable).toEqual([]);
  });

  it("names emoji when no emoji font draws them", async () => {
    const { unprintable } = await exportPdf(scene("Hello 😀"), false);
    expect(unprintable).toContain("😀");
  });

  it("checks bold and italic text against the face it is printed in", async () => {
    const { unprintable } = await exportPdf(scene("**太字** *斜体* ***両方***"));
    expect(unprintable).toEqual(["太", "字", "斜", "体", "両", "方"]);
  });

  it("checks each run against the face supplied for it", async () => {
    const { buildPDF } = await load("buildPDF.ts");
    const supplied = { ...fonts(), bold: readFont("courier-prime-sans-bold.ttf") };
    const { unprintable } = await buildPDF([scene("**Ω Ж** Ω Ж")], { screenplay_print_title_page: false }, supplied);
    expect(unprintable).toEqual(["Ж", "Ω"]);
  });
});

describe("the notice for unprintable characters", () => {
  it("lists the first characters and counts the rest", async () => {
    const { unprintableNotice } = await load("utils/unprintableNotice.ts");
    const lead = "Some characters can't be printed in the screenplay font and are blank in the PDF:";
    expect(unprintableNotice([])).toBe("");
    expect(unprintableNotice(["日", "本"])).toBe(`${lead} 日 本`);
    expect(unprintableNotice([ACUTE])).toBe(`${lead} ${DOTTED_CIRCLE}${ACUTE}`);
    const many = [..."一二三四五六七八九十百千万億兆京垓秭穣溝澗正"];
    expect(unprintableNotice(many)).toBe(`${lead} ${many.slice(0, 20).join(" ")} and 2 more`);
  });
});
