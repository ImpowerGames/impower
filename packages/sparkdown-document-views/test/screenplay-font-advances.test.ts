// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { SCRIPT_FONT_ADVANCES, type FontAdvanceRange, type ScriptFace } from "../../sparkdown-screenplay/src/constants/SCRIPT_FONT_ADVANCES";
import { scriptAdvanceOf, scriptTextWidth } from "../../sparkdown-screenplay/src/utils/scriptFontAdvance";
import { FALLBACK_FONT_SOURCES, fallbackScriptOf } from "../../sparkdown-screenplay-pdf/src/utils/fallbackFontSources";

const FACES: [ScriptFace, string][] = [
  ["normal", "courier-prime.ttf"],
  ["bold", "courier-prime-bold.ttf"],
  ["italic", "courier-prime-italic.ttf"],
  ["bolditalic", "courier-prime-bold-italic.ttf"],
];

const WEIGHT_OF: Record<ScriptFace, "normal" | "bold"> = { normal: "normal", bold: "bold", italic: "normal", bolditalic: "bold" };

const PDF_SOURCE = resolve(__dirname, "../../sparkdown-screenplay-pdf/src");

const load = (path: string) => import(pathToFileURL(resolve(PDF_SOURCE, path)).href);

const FONT_DIRS = [resolve(__dirname, "../../../impower-dev/src/public/fonts"), resolve(__dirname, "../../../vscode-sparkdown/data")];

const FALLBACK_DIR = resolve(__dirname, "fixtures/fallback-fonts");

const FIXTURE_CHARACTERS = [...readFileSync(resolve(FALLBACK_DIR, "characters.txt"), "utf8").trim()];

const bufferOf = (path: string) => {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const fixturePath = (name: string, weight: "normal" | "bold") =>
  resolve(FALLBACK_DIR, `${name.toLowerCase().replace(/ /g, "-")}-${weight}.ttf`);

const FIXTURE_SOURCES = FALLBACK_FONT_SOURCES.filter((source) => existsSync(fixturePath(source.name, "normal")));

const FALLBACKS = FIXTURE_SOURCES.map((source) => ({
  normal: bufferOf(fixturePath(source.name, "normal")),
  bold: bufferOf(fixturePath(source.name, "bold")),
}));

const inRanges = (ranges: FontAdvanceRange[], codePoint: number) =>
  ranges.some(([first, last]) => codePoint >= first && codePoint <= last);

const courierAdvancesOf = (font: fontkit.Font, face: ScriptFace) => {
  const missing = font.getGlyph(0).advanceWidth;
  const ranges: FontAdvanceRange[] = [];
  for (const codePoint of [...font.characterSet].sort((a, b) => a - b)) {
    const advance = font.glyphForCodePoint(codePoint).advanceWidth;
    if (advance === missing && !inRanges(SCRIPT_FONT_ADVANCES[face].fallback.ranges, codePoint)) continue;
    const last = ranges.at(-1);
    if (last && last[1] === codePoint - 1 && last[2] === advance) last[1] = codePoint;
    else ranges.push([codePoint, codePoint, advance]);
  }
  return { unitsPerEm: font.unitsPerEm, missing, ranges };
};

const SAMPLES = [
  "これは長い日本語の台詞で、列車が駅に着くまで話し続けます。",
  "我们在火车站等了很久，然后终于看到了那列老火车。",
  "기차가 역에 도착할 때까지 기다렸습니다.",
  "The sign reads 東京駅 then 서울역 and the Ωmega line runs past 北京.",
  "ΑΒΓΔ αβγδ Ω e\u0301 and Жук",
];

describe("the Screenplay page's glyph advances", () => {
  it.each(FONT_DIRS.flatMap((dir) => FACES.map(([face, file]) => [face, resolve(dir, file)] as const)))(
    "match the %s face the printer loads from %s",
    (face, path) => {
      const bytes = readFileSync(path);
      const font = fontkit.create(bytes) as fontkit.Font;
      const { fallback: _fallback, ...courier } = SCRIPT_FONT_ADVANCES[face];
      expect(courierAdvancesOf(font, face)).toEqual(courier);
      const doc = new PDFDocument({ font: "", size: "LETTER" });
      doc.registerFont(face, bytes);
      doc.font(face).fontSize(12);
      const covered = String.fromCodePoint(...font.characterSet.filter((codePoint) => codePoint > 0x20));
      expect(scriptTextWidth(covered, face, 12) * 72).toBeCloseTo(doc.widthOfString(covered), 6);
    },
  );

  it.each(FACES.map(([face]) => face))("carry each fallback font's advance for the characters it prints in the %s face", (face) => {
    const courier = fontkit.create(readFileSync(resolve(FONT_DIRS[0]!, FACES.find(([name]) => name === face)![1]))) as fontkit.Font;
    let checked = 0;
    for (const source of FIXTURE_SOURCES) {
      const fallback = fontkit.create(readFileSync(fixturePath(source.name, WEIGHT_OF[face]))) as fontkit.Font;
      for (const character of FIXTURE_CHARACTERS) {
        const codePoint = character.codePointAt(0)!;
        if (fallbackScriptOf(character) !== source.script || courier.hasGlyphForCodePoint(codePoint)) continue;
        if (!fallback.hasGlyphForCodePoint(codePoint)) continue;
        expect(scriptAdvanceOf(face, codePoint), `U+${codePoint.toString(16)} in ${source.name}`).toBe(
          fallback.glyphForCodePoint(codePoint).advanceWidth / fallback.unitsPerEm,
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it.each(FACES.map(([face]) => face))("measure each line as wide as the PDF prints it with the fallback fonts in the %s face", async (face) => {
    const { measureTextWidth } = await load("textbox-for-pdfkit/src/utils/textMeasurement.ts");
    const { registerFallbackFonts } = await load("utils/fallbackFonts.ts");
    const doc = new PDFDocument({ font: "", size: "LETTER" });
    const faces = Object.fromEntries(FACES.map(([name, path]) => [name, bufferOf(resolve(FONT_DIRS[0]!, path))]));
    for (const [name, bytes] of Object.entries(faces)) doc.registerFont(name, bytes);
    registerFallbackFonts(doc, faces, FALLBACKS);
    doc.font(face).fontSize(12);
    for (const text of SAMPLES) {
      const printed = measureTextWidth({ text, font: face, fontSize: 12 }, doc);
      expect(scriptTextWidth(text, face, 12) * 72, text.slice(0, 40)).toBeCloseTo(printed, 6);
    }
  });
});
