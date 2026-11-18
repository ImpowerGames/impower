// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { SCRIPT_FONT_ADVANCES, type ScriptFace, type ScriptFontAdvances } from "../../sparkdown-screenplay/src/constants/SCRIPT_FONT_ADVANCES";
import { scriptTextWidth } from "../../sparkdown-screenplay/src/utils/scriptFontAdvance";

const FACES: [ScriptFace, string][] = [
  ["normal", "courier-prime.ttf"],
  ["bold", "courier-prime-bold.ttf"],
  ["italic", "courier-prime-italic.ttf"],
  ["bolditalic", "courier-prime-bold-italic.ttf"],
];

const FONT_DIRS = [resolve(__dirname, "../../../impower-dev/src/public/fonts"), resolve(__dirname, "../../../vscode-sparkdown/data")];

const advancesOf = (font: fontkit.Font): ScriptFontAdvances => {
  const missing = font.getGlyph(0).advanceWidth;
  const ranges: ScriptFontAdvances["ranges"] = [];
  for (const codePoint of [...font.characterSet].sort((a, b) => a - b)) {
    const advance = font.glyphForCodePoint(codePoint).advanceWidth;
    if (advance === missing) continue;
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
  "é \u{20000}\u{20001} العربية नमस्ते �",
];

describe("the Screenplay page's glyph advances", () => {
  it.each(FONT_DIRS.flatMap((dir) => FACES.map(([face, file]) => [face, resolve(dir, file)] as const)))(
    "match the %s face the printer loads from %s",
    (face, path) => {
      const bytes = readFileSync(path);
      expect(advancesOf(fontkit.create(bytes) as fontkit.Font)).toEqual(SCRIPT_FONT_ADVANCES[face]);
      const doc = new PDFDocument({ font: "", size: "LETTER" });
      doc.registerFont(face, bytes);
      doc.font(face).fontSize(12);
      const font = fontkit.create(bytes) as fontkit.Font;
      const covered = String.fromCodePoint(...font.characterSet.filter((codePoint) => codePoint > 0x20));
      for (const text of [covered, ...SAMPLES]) {
        expect(scriptTextWidth(text, face, 12) * 72, text.slice(0, 40)).toBeCloseTo(doc.widthOfString(text), 6);
      }
    },
  );
});
