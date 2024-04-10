import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

const SINGLE_MARKERS = ["|", "*", "_"];
const DOUBLE_MARKERS = ["~~", "::"];
const CHAR_REGEX =
  /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;

export const styleText = (
  text: string,
  overrides?: TextOptions
): FormattedText[] => {
  const textChunks: FormattedText[] = [];
  const chars = text.replace("\t", "    ").match(CHAR_REGEX);
  if (chars) {
    const marks: [string][] = [];
    let escaped = false;
    for (let i = 0; i < chars.length; ) {
      const char = chars[i] || "";
      const nextChar = chars[i + 1] || "";
      if (!escaped) {
        if (char === "\\") {
          // escape char
          i += 1;
          escaped = true;
          continue;
        }
        if (char === "<") {
          let control = "";
          let arg = "";
          i += 1;
          while (chars[i] !== ">" && chars[i] !== ":") {
            control += chars[i];
            i += 1;
          }
          if (chars[i] === ":") {
            i += 1;
            while (chars[i] !== ">") {
              arg += chars[i];
              i += 1;
            }
          }
          if (chars[i] === ">") {
            i += 1;
          }
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
          const lastMatchingMark = marks.findLast(([m]) => m === mark);
          if (lastMatchingMark) {
            if (marks.at(-1) !== lastMatchingMark) {
              marks.pop();
            }
            marks.pop();
          } else {
            marks.push([mark]);
          }
          i += mark.length;
          continue;
        }
      }
      escaped = false;
      const activeCenteredMark = marks.findLast(([m]) => m.startsWith("|"));
      const activeUnderlineMark = marks.findLast(([m]) => m.startsWith("_"));
      const activeBoldItalicMark = marks.findLast(([m]) => m.startsWith("***"));
      const activeBoldMark = marks.findLast(([m]) => m.startsWith("**"));
      const activeItalicMark = marks.findLast(([m]) => m.startsWith("*"));
      const isCentered = Boolean(activeCenteredMark);
      const isUnderlined = Boolean(activeUnderlineMark);
      const isItalicized =
        Boolean(activeBoldItalicMark) || Boolean(activeItalicMark);
      const isBolded = Boolean(activeBoldItalicMark) || Boolean(activeBoldMark);

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
  }
  return textChunks;
};
