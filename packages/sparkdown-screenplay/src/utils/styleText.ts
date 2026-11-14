import {
  SCAN_CLOSE,
  SCAN_OPEN,
  SPAN_CLOSE,
  SPAN_END,
  isStyleCode,
  readSpanOpen,
  spanStyle,
} from "../../../sparkdown/src/runtime/displayStyle";
import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

export const SOURCE_COLOR = "#808080";

export const styleText = (
  text: string,
  overrides?: TextOptions,
  at?: number[],
): FormattedText[] => {
  const textChunks: FormattedText[] = [];
  const marks: string[] = [];
  let source = 0;
  const chars = text.replace("\t", "    ");
  const tab = text.indexOf("\t");
  const placed =
    at && tab >= 0 ? [...at.slice(0, tab), ...new Array<number>(4).fill(at[tab]!), ...at.slice(tab + 1)] : at;
  for (let i = 0; i < chars.length; ) {
    const opened = readSpanOpen(chars, i);
    if (opened) {
      marks.push(opened.mark);
      i = opened.next;
      continue;
    }
    const char = chars[i]!;
    const position = placed?.[i];
    i += 1;
    if (char === SPAN_CLOSE || char === SPAN_END) {
      marks.pop();
    } else if (char === SCAN_OPEN) {
      source += 1;
    } else if (char === SCAN_CLOSE) {
      source = Math.max(0, source - 1);
    } else if (!isStyleCode(char)) {
      const style = spanStyle(marks);
      const chunk: FormattedText = { text: char };
      if (style.bold) {
        chunk.bold = true;
      }
      if (style.italic) {
        chunk.italic = true;
      }
      if (style.underline) {
        chunk.underline = true;
      }
      if (style.centered) {
        chunk.align = "center";
      }
      if (source > 0) {
        chunk.color = SOURCE_COLOR;
      }
      textChunks.push(position === undefined ? { ...chunk, ...overrides } : { ...chunk, ...overrides, at: [position] });
    }
  }
  return textChunks;
};
