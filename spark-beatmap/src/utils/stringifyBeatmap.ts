import { Beat } from "../types/Beat";
import { roundDecimalToRatio } from "./roundDecimalToRatio";

const getIntegerSeparators = (diff: number): string[] => {
  if (diff === 1) {
    return ["----"];
  }
  if (diff === 2) {
    return ["===="];
  }
  if (diff === 3) {
    return ["====", "----"];
  }
  if (diff === 4) {
    return ["====", "===="];
  }
  if (diff === Math.floor(diff)) {
    const diffLength = diff.toString().length;
    if (diffLength === 1) {
      return [`--${diff}--`];
    }
    return [`-${diff}-`];
  }
  return [];
};

const getMeasureSeparators = (diff: number): string[] => {
  const intSeparators = getIntegerSeparators(diff);
  if (intSeparators.length > 0) {
    return intSeparators;
  }
  const ratio = roundDecimalToRatio(diff);
  const ratioStr = ratio === "1" ? "--" : ratio;
  if (ratioStr.includes(".") && diff > 1) {
    const integer = Math.floor(diff);
    const remainder = diff - integer;
    const remRatio = roundDecimalToRatio(remainder);
    const remRatioStr = remRatio === "1" ? "--" : remRatio;
    return [...getIntegerSeparators(integer), `-${remRatioStr}-`];
  } else {
    return [`-${ratioStr}-`];
  }
};

const setChar = (str: string, index: number, chr: string): string => {
  if (index > str.length - 1) return str;
  return str.substring(0, index) + chr + str.substring(index + 1);
};

const rowOf = (str: string, length: number): string => {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += str;
  }
  return result;
};

const columnsOf = (str: string, length: number): string => {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    if (result) {
      result += "\n";
    }
    result += str;
  }
  return result;
};

export const stringifyBeatmap = (
  beats: Beat[],
  rowsPerBeat = 3,
  columnsPerBeat = 4,
  reversed = false
): string => {
  let tokens: string[] = [];
  tokens.push(rowOf("~", columnsPerBeat));
  tokens.push("START");
  let i = 0;
  const sortedBeats = beats.sort((a, b) => (a.n || 0) - (b.n || 0));
  sortedBeats.forEach((beat) => {
    if (beat) {
      const n = beat.n || 0;
      const x = beat.x || 0;
      const y = beat.y || 0;
      const d = beat.d || "*";
      const bpm = beat.bpm || 0;
      const diff = n - i;
      if (diff > 0) {
        if (bpm) {
          tokens.push(`@${bpm}`);
        }
        tokens.push(...getMeasureSeparators(diff));
        tokens.push(columnsOf(rowOf(" ", columnsPerBeat), rowsPerBeat));
      }
      const currBeat = tokens[tokens.length - 1] || "";
      const currBeatLines = currBeat.split("\n");
      const lineIndex = currBeatLines.length - 1 - y;
      currBeatLines[lineIndex] = setChar(
        currBeatLines[lineIndex] || rowOf(" ", columnsPerBeat),
        x,
        d
      );
      tokens[tokens.length - 1] = currBeatLines.join("\n");
      i = n;
    }
  });
  tokens.push("END");
  tokens.push(rowOf("~", columnsPerBeat));
  if (reversed) {
    tokens.reverse();
  }
  return tokens.join("\n");
};
