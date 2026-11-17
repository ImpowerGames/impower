import { SCRIPT_FONT_ADVANCES, type ScriptFace } from "../constants/SCRIPT_FONT_ADVANCES";
import type { TextOptions } from "../types/TextOptions";

export const printedFontOf = (style: Pick<TextOptions, "font" | "bold" | "italic">): string =>
  style.font ?? (style.bold && style.italic ? "bolditalic" : style.bold ? "bold" : style.italic ? "italic" : "normal");

export const scriptFaceOf = (style: Pick<TextOptions, "font" | "bold" | "italic">): ScriptFace => {
  const font = printedFontOf(style);
  return font in SCRIPT_FONT_ADVANCES ? (font as ScriptFace) : "normal";
};

export const scriptAdvanceOf = (face: ScriptFace, codePoint: number) => {
  const { ranges, missing } = SCRIPT_FONT_ADVANCES[face];
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last, advance] = ranges[middle]!;
    if (codePoint < first) high = middle - 1;
    else if (codePoint > last) low = middle + 1;
    else return advance;
  }
  return missing;
};

export const scriptTextWidth = (text: string, face: ScriptFace, fontSize: number) => {
  let units = 0;
  for (const character of text) units += scriptAdvanceOf(face, character.codePointAt(0)!);
  return (units / SCRIPT_FONT_ADVANCES[face].unitsPerEm) * (fontSize / 72);
};
