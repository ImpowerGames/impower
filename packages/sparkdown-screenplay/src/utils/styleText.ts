import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

const SINGLE_MARKERS = ["|", "*", "_", "^"];
const DOUBLE_MARKERS = ["~~", "::"];

export const styleText = (
  text: string,
  overrides?: TextOptions
): FormattedText[] => {
  let escaped = false;
  const marks: [string, number][] = [];
  const chars = text.replace("\t", "    ");
  const textChunks: FormattedText[] = [];
  for (let i = 0; i < chars.length; ) {
    const char = chars[i] || "";
    const nextChar = chars[i + 1] || "";
    const lastMark = marks[marks.length - 1]?.[0];
    if (!escaped) {
      if (char === "\\") {
        // escape char
        i += 1;
        escaped = true;
        continue;
      }
      if (
        SINGLE_MARKERS.includes(char) ||
        DOUBLE_MARKERS.includes(char + nextChar)
      ) {
        let mark = "";
        let m = i;
        while (chars[m] === char) {
          mark += chars[m];
          m += 1;
        }
        if (lastMark === mark) {
          marks.pop();
        } else {
          marks.push([mark, textChunks.length - 1]);
        }
        i += mark.length;
        continue;
      }
    }
    escaped = false;
    const markers = marks.map(([mark]) => mark);
    const activeCenteredMark = markers.find((m) => m.startsWith("|"));
    const activeBoldItalicMark = markers.find((m) => m.startsWith("***"));
    const activeUnderlineMark = markers.find((m) => m.startsWith("_"));
    const isCentered = Boolean(activeCenteredMark);
    const hasBoldItalicMark = Boolean(activeBoldItalicMark);
    const isUnderlined = Boolean(activeUnderlineMark);
    const hasBoldMark = markers.includes("**");
    const hasItalicMark = markers.includes("*");
    const isItalicized = hasBoldItalicMark || hasItalicMark;
    const isBolded = hasBoldItalicMark || hasBoldMark;

    const chunk: FormattedText = { text: char };
    if (isBolded && isItalicized) {
      chunk.bold = true;
      chunk.italic = true;
    } else if (isBolded) {
      chunk.bold = true;
    } else if (isItalicized) {
      chunk.italic = true;
    }
    if (isUnderlined) {
      chunk.underline = true;
    }
    if (isCentered) {
      chunk.align = "center";
    }
    const overriddenChunk = { ...chunk, ...overrides };
    textChunks.push(overriddenChunk);
    i += 1;
  }
  return textChunks;
};
