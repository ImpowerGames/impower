import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

const MARKERS = ["^", "*", "_", "~~", "::"];
const CHAR_REGEX =
  /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;

export const styleText = (
  text: string,
  overrides?: TextOptions
): FormattedText[] => {
  const textChunks: FormattedText[] = [];
  const chars = text.replace("\t", "    ").match(CHAR_REGEX);
  if (chars) {
    const activeMarks: [string][] = [];
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
        if (char === "[" && nextChar === "[") {
          let closed = false;
          const startIndex = i;
          i += 2;
          while (i < chars.length) {
            if (chars[i] === "]" && chars[i + 1] === "]") {
              closed = true;
              i += 2;
              break;
            }
            i += 1;
          }
          if (!closed) {
            i = startIndex;
            escaped = true;
          }
          continue;
        }
        if (char === "(" && nextChar === "(") {
          let closed = false;
          const startIndex = i;
          i += 2;
          while (i < chars.length) {
            if (chars[i] === ")" && chars[i + 1] === ")") {
              closed = true;
              i += 2;
              break;
            }
            i += 1;
          }
          if (!closed) {
            i = startIndex;
            escaped = true;
          }
          continue;
        }
        if (char === "<" && nextChar === ">") {
          // Glue
          i += 2;
          continue;
        }
        if (char === "<") {
          let control = "";
          let arg = "";
          i += 1;
          while (chars[i] && chars[i] !== ">" && chars[i] !== ":") {
            control += chars[i];
            i += 1;
          }
          if (chars[i] === ":") {
            i += 1;
            while (chars[i] && chars[i] !== ">") {
              arg += chars[i];
              i += 1;
            }
          }
          if (chars[i] === ">") {
            i += 1;
          }
          continue;
        }
        // Style Tag
        const styleMarker = MARKERS.find(
          (marker) => marker === chars.slice(i, i + marker.length).join("")
        );
        if (styleMarker) {
          let currentMarker = "";
          const startIndex = i;
          while (chars[i] && chars[i] === char) {
            currentMarker += chars[i];
            i += 1;
          }
          const lastMatchingMark =
            activeMarks.findLast(
              ([activeMarker]) => activeMarker === currentMarker
            ) ||
            activeMarks.findLast(
              ([activeMarker]) =>
                activeMarker.slice(0, styleMarker.length) ===
                currentMarker.slice(0, styleMarker.length)
            );
          if (lastMatchingMark) {
            while (activeMarks.at(-1) !== lastMatchingMark) {
              activeMarks.pop();
            }
            activeMarks.pop();
            const [lastMatchingMarker] = lastMatchingMark;
            i = startIndex + lastMatchingMarker.length;
          } else {
            activeMarks.push([currentMarker]);
          }
          continue;
        }
      }
      escaped = false;
      const activeCenteredMark = activeMarks.findLast(([m]) =>
        m.startsWith("^")
      );
      const activeUnderlineMark = activeMarks.findLast(([m]) =>
        m.startsWith("_")
      );
      const activeBoldItalicMark = activeMarks.findLast(([m]) =>
        m.startsWith("***")
      );
      const activeBoldMark = activeMarks.findLast(([m]) => m.startsWith("**"));
      const activeItalicMark = activeMarks.findLast(([m]) => m.startsWith("*"));
      const isCentered = Boolean(activeCenteredMark);
      const isUnderlined = Boolean(activeUnderlineMark);
      const isItalicized =
        Boolean(activeBoldItalicMark) || Boolean(activeItalicMark);
      const isBolded = Boolean(activeBoldItalicMark) || Boolean(activeBoldMark);

      const chunk: FormattedText = { text: char };
      if (isBolded) {
        chunk.bold = true;
      }
      if (isItalicized) {
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
