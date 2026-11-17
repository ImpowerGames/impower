export interface ScriptFontAdvances {
  unitsPerEm: number;
  missing: number;
  ranges: [first: number, last: number, advance: number][];
}

export type ScriptFace = "normal" | "bold" | "italic" | "bolditalic";

export const SCRIPT_FONT_ADVANCES: Record<ScriptFace, ScriptFontAdvances> = {
  normal: { unitsPerEm: 2048, missing: 1228, ranges: [[0, 0, 0]] },
  bold: { unitsPerEm: 2048, missing: 1228, ranges: [[0, 0, 0]] },
  italic: { unitsPerEm: 2048, missing: 1228, ranges: [[0, 0, 0]] },
  bolditalic: { unitsPerEm: 2048, missing: 1228, ranges: [[0, 0, 0]] },
};
