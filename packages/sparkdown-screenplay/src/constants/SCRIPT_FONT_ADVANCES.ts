import { FALLBACK_FONT_ADVANCES } from "./FALLBACK_FONT_ADVANCES";

export type FontAdvanceRange = [first: number, last: number, advance: number];

export interface FontAdvances {
  unitsPerEm: number;
  ranges: FontAdvanceRange[];
}

export interface ScriptFontAdvances extends FontAdvances {
  missing: number;
  fallback: FontAdvances;
}

export type ScriptFace = "normal" | "bold" | "italic" | "bolditalic";

const unpack = ({ unitsPerEm, packed }: { unitsPerEm: number; packed: number[] }): FontAdvances => {
  const ranges: FontAdvanceRange[] = [];
  let previous = -1;
  for (let index = 0; index < packed.length; index += 3) {
    const first = previous + 1 + packed[index]!;
    previous = first + packed[index + 1]!;
    ranges.push([first, previous, packed[index + 2]!]);
  }
  return { unitsPerEm, ranges };
};

const FALLBACK = { normal: unpack(FALLBACK_FONT_ADVANCES.normal), bold: unpack(FALLBACK_FONT_ADVANCES.bold) };

export const SCRIPT_FONT_ADVANCES: Record<ScriptFace, ScriptFontAdvances> = {
  normal: {
    unitsPerEm: 2048,
    missing: 1228,
    ranges: [[0,0,0],[8308,8308,1228]],
    fallback: FALLBACK.normal,
  },
  bold: {
    unitsPerEm: 2048,
    missing: 1228,
    ranges: [[0,0,0],[1256,1257,1228]],
    fallback: FALLBACK.bold,
  },
  italic: {
    unitsPerEm: 2048,
    missing: 1228,
    ranges: [[0,0,0]],
    fallback: FALLBACK.normal,
  },
  bolditalic: {
    unitsPerEm: 2048,
    missing: 1228,
    ranges: [[0,0,0],[1138,1139,1228]],
    fallback: FALLBACK.bold,
  },
};
