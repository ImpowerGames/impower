import type { Beat } from "../types/Beat";
import roundToRatioDecimal from "./roundToRatioDecimal";

const WHITESPACE_REGEX = /[ ]/g;
const SEPARATOR_REGEX = /[-]/g;
const NEWLINE_REGEX = /\r\n|\r|\n/;
const ROW_REGEX = /^[^-=~@!]*$/;

const getIncrement = (text: string) => {
  const t = text.trim();
  const restStr = t.replace(SEPARATOR_REGEX, "").replace(WHITESPACE_REGEX, "");
  const [numeratorStr, denominatorStr] = restStr.split(":");
  const numerator =
    !numeratorStr || Number.isNaN(Number(numeratorStr))
      ? 1
      : Number(numeratorStr);
  const denominator =
    !denominatorStr || Number.isNaN(Number(denominatorStr))
      ? 1
      : Number(denominatorStr);
  const val = numerator / denominator;
  const result = val;
  if (Number.isNaN(result)) {
    return 1;
  }
  return result;
};

const getKey = (text: string | undefined): string => {
  return text?.trim()?.[0] || "";
};

export type ParsedBeat = Beat & { from: number; to: number; line: number };

export const parseBeatmap = (
  script:
    | string
    | string[]
    | { line: number; from: number; to: number; text: string }[]
): ParsedBeat[] => {
  const beats: ParsedBeat[] = [];
  let from = 0;
  const splitScript = Array.isArray(script)
    ? script
    : script.split(NEWLINE_REGEX);
  const newlineCharacterLength = 1;
  const lines = splitScript.map((item, i) => {
    if (typeof item === "string") {
      const result = { line: i, from, to: from + item.length, text: item };
      from = result.to + newlineCharacterLength;
      return result;
    }
    return item;
  });
  let n = 0;
  let bpm: number | undefined = undefined;

  let isReversed = false;
  for (let i = 0; i < 5; i += 1) {
    // Check if any of the first 5 lines starts with an !END! marker
    if (lines[i]?.text.startsWith("!E")) {
      isReversed = true;
    }
  }
  if (isReversed) {
    lines.reverse();
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line) {
      const text = line.text;
      const key = getKey(text) || "";
      switch (key) {
        case "@": {
          bpm = Number(text.slice(1));
          break;
        }
        case "-":
        case "=": {
          const inc = getIncrement(text);
          n += inc;
          n = roundToRatioDecimal(n);
          break;
        }
        default: {
          let numRows = 0;
          for (; numRows < lines.length; numRows += 1) {
            const rowIndex = i + numRows;
            const row = lines[rowIndex]?.text || "";
            if (!row || !ROW_REGEX.test(row)) {
              break;
            }
          }
          if (!numRows) {
            break;
          }
          for (let y = 0; y < numRows; y += 1) {
            const rowIndex = isReversed ? i + y : i + numRows - 1 - y;
            const row = lines[rowIndex]?.text || "";
            if (row.trim()) {
              for (let x = 0; x < row.length; x += 1) {
                const symbol = row[x];
                if (symbol && symbol !== " " && symbol !== ".") {
                  const d = symbol;
                  const newBeat: ParsedBeat = {
                    z: n,
                    s: d,
                    x,
                    y,
                    line: line.line,
                    from: line.from,
                    to: line.to,
                  };
                  if (bpm) {
                    newBeat.bpm = bpm;
                    bpm = undefined;
                  }
                  beats.push(newBeat);
                }
              }
            }
          }
          i += numRows - 1;
          break;
        }
      }
    }
  }
  return beats;
};
