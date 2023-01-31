import { Beat } from "../types/Beat";
import { InputSymbol } from "../types/InputSymbol";
import { roundToRatioDecimal } from "./roundToRatioDecimal";

const SEPARATOR_REGEX = /[-= ]/g;
const NEWLINE_REGEX = /\r\n|\r|\n/;

const getIncrement = (text: string) => {
  const t = text.trim();
  const key = t[0];
  const restStr = t.replace(SEPARATOR_REGEX, "");
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

export const parseBeatmap = (script: string, rowsPerBeat = 3): Beat[] => {
  const beats: Beat[] = [];
  const lines = script.split(NEWLINE_REGEX);
  let n = 0;
  let bpm: number | undefined = undefined;
  let beatmapStarted = false;
  let direction: "forward" | "reversed" | "" = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const text = line?.trim() || "";
    const key = text[0] || "";
    if (key === "~") {
      if (!beatmapStarted) {
        beatmapStarted = true;
        continue;
      } else {
        return beats;
      }
    }
    if (beatmapStarted) {
      switch (key) {
        case "S":
          // START
          if (!direction) {
            direction = "forward";
          }
          break;
        case "E":
          // END
          if (!direction) {
            direction = "reversed";
          }
          break;
        case "~":
          // MARKER
          break;
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
          for (let y = 0; y < rowsPerBeat; y += 1) {
            const row = lines[i + 2 - y] || "";
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
      }
    }
  }
  if (direction === "reversed") {
    return beats.reverse();
  }
  return beats;
};
