import { Beat } from "../types/Beat";
import { InputSymbol } from "../types/InputSymbol";
import { roundToRatioDecimal } from "./roundToRatioDecimal";

const WHITESPACE_REGEX = /[ ]/g;
const SEPARATOR_REGEX = /[-=]/g;
const NEWLINE_REGEX = /\r\n|\r|\n/;

const getIncrement = (text: string) => {
  const t = text.trim();
  const key = t[0];
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
  const multiplier = key === "=" ? 2 : 1;
  const result = val * multiplier;
  if (Number.isNaN(result)) {
    return 1;
  }
  return result;
};

const getKey = (text: string | undefined): string => {
  return text?.trim()?.[0] || "";
};

export const parseBeatmap = (script: string, rowsPerBeat = 3): Beat[] => {
  const beats: Beat[] = [];
  const trimmedScript = script?.trim();
  const lines = trimmedScript.split(NEWLINE_REGEX);
  let n = 0;
  let bpm: number | undefined = undefined;
  const firstLineIndex = getKey(lines[0]) === "~" ? 1 : 0;
  const firstLineKey = getKey(lines[firstLineIndex]);
  const reversed = firstLineKey === "E";
  if (reversed) {
    lines.reverse();
  }
  for (let i = firstLineIndex; i < lines.length; i += 1) {
    const text = lines[i] || "";
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
      case "":
      case "^":
      case "v":
      case "<":
      case ">":
      case "\\":
      case "/":
      case "*":
      case " ": {
        for (let y = 0; y < rowsPerBeat; y += 1) {
          const rowIndex = reversed ? i + y : i + rowsPerBeat - 1 - y;
          const row = lines[rowIndex] || "";
          if (row.trim()) {
            for (let x = 0; x < row.length; x += 1) {
              const symbol = row[x];
              if (symbol && symbol !== " ") {
                const d = symbol as InputSymbol;
                const newBeat: Beat = { n, d, x, y };
                if (bpm) {
                  newBeat.bpm = bpm;
                  bpm = undefined;
                }
                beats.push(newBeat);
              }
            }
          }
        }
        i += rowsPerBeat - 1;
        break;
      }
      default: {
        // NoOp
        break;
      }
    }
  }
  return beats;
};
