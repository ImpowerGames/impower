import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

const MARKERS = ["^", "*", "_", "~~", "::"];
const CHAR_REGEX =
  /\p{RI}\p{RI}|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})|./gsu;

const isWhitespace = (part: string | undefined) => {
  if (!part) {
    return false;
  }
  for (let i = 0; i < part.length; i += 1) {
    const c = part[i]!;
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
      return false;
    }
  }
  return true;
};

const isSpace = (part: string | undefined) => {
  if (!part) {
    return false;
  }
  for (let i = 0; i < part.length; i += 1) {
    const c = part[i]!;
    if (c !== " " && c !== "\t") {
      return false;
    }
  }
  return true;
};

export const styleText = (
  text: string,
  overrides?: TextOptions
): FormattedText[] => {
  const textChunks: FormattedText[] = [];
  const chars = text.replace("\t", "    ").match(CHAR_REGEX);
  if (chars) {
    const activeMarks: [string][] = [];
    let escaped = false;
    let logic = false;
    let divert = false;
    let raw = false;
    for (let i = 0; i < chars.length; ) {
      const char = chars[i] ?? "";
      const nextChar = chars[i + 1] ?? "";
      let charIsLogicCloser = false;
      if (!escaped) {
        if (char === "{") {
          logic = true;
        }
        if (char === "}") {
          if (logic) {
            charIsLogicCloser = true;
          }
          logic = false;
        }
        if (char === "-" && nextChar === ">") {
          divert = true;
        }
        if (char === "\n") {
          divert = false;
        }
        // Raw
        if (char === "`") {
          i += 1;
          raw = !raw;
          continue;
        }
        if (!logic && !divert && !raw) {
          // Escape
          if (char === "\\") {
            i += 1;
            escaped = true;
            continue;
          }
          // Image Tag
          if (char === "[" && nextChar === "[") {
            let closed = false;
            const startIndex = i;
            i += 2;
            while (i < chars.length) {
              if (chars[i] === "]" && chars[i + 1] === "]") {
                closed = true;
                i += 2;
                // consume trailing whitespace
                while (i < chars.length) {
                  if (!isSpace(chars[i])) {
                    break;
                  }
                  i += 1;
                }
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
          // Audio Tag
          if (char === "(" && nextChar === "(") {
            let closed = false;
            const startIndex = i;
            i += 2;
            while (i < chars.length) {
              if (chars[i] === ")" && chars[i + 1] === ")") {
                closed = true;
                i += 2;
                // consume trailing whitespace
                while (i < chars.length) {
                  if (!isSpace(chars[i])) {
                    break;
                  }
                  i += 1;
                }
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
          // Text Tag
          if (char === "<" && !isWhitespace(chars[i + 1])) {
            const startIndex = i;
            i += 1;
            while (chars[i] && chars[i] !== ">" && chars[i] !== ":") {
              i += 1;
            }
            if (chars[i] === ":") {
              i += 1;
              while (chars[i] && chars[i] !== ">") {
                i += 1;
              }
            }
            const closed = chars[i] === ">";
            if (closed) {
              i += 1;
            } else {
              i = startIndex;
              escaped = true;
            }
            continue;
          }
          // Flow Tag
          if (char === "=") {
            let id = "";
            const startIndex = i;
            i += 1;
            while (chars[i] && chars[i] !== "=") {
              id += chars[i];
              i += 1;
            }
            const closed = chars[i] === "=";
            if (closed) {
              i += 1;
              // consume trailing whitespace
              while (i < chars.length) {
                if (!isSpace(chars[i])) {
                  break;
                }
                i += 1;
              }
            } else {
              i = startIndex;
              escaped = true;
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
      const activeBoldMark = activeMarks.findLast(([m]) => m === "**");
      const activeItalicMark = activeMarks.findLast(([m]) => m === "*");
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
      if (logic || charIsLogicCloser || divert) {
        chunk.color = "#808080";
      }
      const overriddenChunk = { ...chunk, ...overrides };
      textChunks.push(overriddenChunk);
      i += 1;
    }
  }
  return textChunks;
};
