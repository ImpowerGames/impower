import { SCRIPT_FONT_ADVANCES, type FontAdvanceRange, type ScriptFace } from "../constants/SCRIPT_FONT_ADVANCES";
import type { TextOptions } from "../types/TextOptions";

export const printedFontOf = (style: Pick<TextOptions, "font" | "bold" | "italic">): string =>
  style.font ?? (style.bold && style.italic ? "bolditalic" : style.bold ? "bold" : style.italic ? "italic" : "normal");

export const scriptFaceOf = (style: Pick<TextOptions, "font" | "bold" | "italic">): ScriptFace => {
  const font = printedFontOf(style);
  return font in SCRIPT_FONT_ADVANCES ? (font as ScriptFace) : "normal";
};

const advanceIn = (ranges: FontAdvanceRange[], codePoint: number): number | undefined => {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last, advance] = ranges[middle]!;
    if (codePoint < first) high = middle - 1;
    else if (codePoint > last) low = middle + 1;
    else return advance;
  }
  return undefined;
};

export const printsWithFallback = (face: ScriptFace, codePoint: number): boolean => {
  const advances = SCRIPT_FONT_ADVANCES[face];
  return advanceIn(advances.ranges, codePoint) === undefined && advanceIn(advances.fallback.ranges, codePoint) !== undefined;
};

export const scriptAdvanceOf = (face: ScriptFace, codePoint: number): number => {
  const advances = SCRIPT_FONT_ADVANCES[face];
  const own = advanceIn(advances.ranges, codePoint);
  if (own !== undefined) return own / advances.unitsPerEm;
  const fallback = advanceIn(advances.fallback.ranges, codePoint);
  if (fallback !== undefined) return fallback / advances.fallback.unitsPerEm;
  return advances.missing / advances.unitsPerEm;
};

export const scriptTextWidth = (text: string, face: ScriptFace, fontSize: number) => {
  let ems = 0;
  for (const character of text) ems += scriptAdvanceOf(face, character.codePointAt(0)!);
  return ems * (fontSize / 72);
};
