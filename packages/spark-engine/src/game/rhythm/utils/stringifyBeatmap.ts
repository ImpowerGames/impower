import { Beat } from "../types/Beat";
import { getRatio } from "./getRatio";

const getIntegerSeparators = (diff: number): string[] => {
  if (diff === 1) {
    return ["----"];
  }
  if (diff === 2) {
    return ["----", "----"];
  }
  if (diff === 3) {
    return ["----", "----", "----"];
  }
  if (diff === 4) {
    return ["----", "----", "----", "----"];
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
  const ratio = getRatio(diff);
  if (ratio) {
    const ratioStr = ratio === "1" ? "--" : ratio;
    return [`-${ratioStr}-`];
  } else {
    const integer = Math.floor(diff);
    const remainder = diff - integer;
    const remRatio = getRatio(remainder);
    const remRatioStr = remRatio === "1" ? "--" : remRatio;
    return [...getIntegerSeparators(integer), `-${remRatioStr}-`];
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
  name: string,
  beats: Beat[],
  reversed = false,
  minRowsPerBeat = 3,
  minColumnsPerBeat = 3
): string => {
  let tokens: string[] = [];
  if (Array.isArray(beats)) {
    let i = 0;
    const sortedBeats = beats.sort((a, b) => (a.z || 0) - (b.z || 0));
    sortedBeats.forEach((beat) => {
      if (beat) {
        const n = beat.z || 0;
        const x = beat.x || 0;
        const y = beat.y || 0;
        const d = beat.s || "*";
        const bpm = beat.bpm || 0;
        const diff = n - i;
        if (diff > 0) {
          if (bpm) {
            tokens.push(`@${bpm}`);
          }
          tokens.push(...getMeasureSeparators(diff));
          tokens.push(columnsOf(rowOf(" ", minColumnsPerBeat), minRowsPerBeat));
        }
        const currBeat = tokens[tokens.length - 1] || "";
        const currBeatLines = currBeat.split("\n").reverse();
        currBeatLines[y] = setChar(
          currBeatLines[y] || rowOf(" ", minColumnsPerBeat),
          x,
          d
        );
        tokens[tokens.length - 1] = currBeatLines.reverse().join("\n");
        i = n;
      }
    });
  }
  if (reversed) {
    tokens.reverse();
  }
  if (reversed) {
    tokens.unshift(
      rowOf("~", minColumnsPerBeat),
      name,
      rowOf("-", minColumnsPerBeat),
      `!END!`
    );
    tokens.push(`!START!`, rowOf("~", minColumnsPerBeat));
  } else {
    tokens.unshift(rowOf("~", minColumnsPerBeat), name, `!START!`);
    tokens.push(
      rowOf("-", minColumnsPerBeat),
      `!END!`,
      rowOf("~", minColumnsPerBeat)
    );
  }
  return tokens.join("\n");
};
