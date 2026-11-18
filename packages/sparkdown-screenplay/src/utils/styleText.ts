import {
  SCAN_CLOSE,
  SCAN_OPEN,
  SPAN_CLOSE,
  SPAN_END,
  isStyleCode,
  readSpanOpen,
  spanStyle,
  type SpanStyle,
} from "../../../sparkdown/src/runtime/displayStyle";
import { FormattedText } from "../types/FormattedText";
import { TextOptions } from "../types/TextOptions";

export const SOURCE_COLOR = "#808080";

const styleTemplate = (style: SpanStyle, fromSource: boolean, overrides?: TextOptions): Omit<FormattedText, "text"> => {
  const template: Omit<FormattedText, "text"> = {};
  if (style.bold) {
    template.bold = true;
  }
  if (style.italic) {
    template.italic = true;
  }
  if (style.underline) {
    template.underline = true;
  }
  if (style.centered) {
    template.align = "center";
  }
  if (fromSource) {
    template.color = SOURCE_COLOR;
  }
  return { ...template, ...overrides };
};

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
  let template: Omit<FormattedText, "text"> | undefined;
  for (let i = 0; i < chars.length; ) {
    const opened = readSpanOpen(chars, i);
    if (opened) {
      marks.push(opened.mark);
      template = undefined;
      i = opened.next;
      continue;
    }
    const char = chars[i]!;
    const position = placed?.[i];
    i += 1;
    if (char === SPAN_CLOSE || char === SPAN_END) {
      marks.pop();
      template = undefined;
    } else if (char === SCAN_OPEN) {
      source += 1;
      template = undefined;
    } else if (char === SCAN_CLOSE) {
      source = Math.max(0, source - 1);
      template = undefined;
    } else if (!isStyleCode(char)) {
      template ??= styleTemplate(spanStyle(marks), source > 0, overrides);
      textChunks.push(position === undefined ? { text: char, ...template } : { text: char, ...template, at: [position] });
    }
  }
  return textChunks;
};
