import { PdfDocument } from "../types/PdfDocument";
import { TextOptions } from "../types/TextOptions";

const REGEX_NOTE_START = /\[\[/g;
const REGEX_NOTE_END = /\]\]/g;
const REGEX_FORMAT_SPLITTER = /(\\\*)|(\*{1,3})|(\\?_)|(\[\[)|(\]\])/g;
const SIZE_FACTOR = 72;
const DEFAULT_COLOR = "#000000";

export const pdfProcessText = (
  doc: PdfDocument,
  text: string,
  x: number,
  y: number,
  options?: TextOptions
): void => {
  if (!doc.formatState) {
    doc.formatState = {};
  }
  const formatState = doc?.formatState;
  const normalFontKey = doc?.fontKeys?.normal || "normal";
  const boldFontKey = doc?.fontKeys?.bold || "bold";
  const italicFontKey = doc?.fontKeys?.italic || "italic";
  const bolditalicFontKey = doc?.fontKeys?.bolditalic || "bolditalic";
  const pageWidth = doc.print?.page_width;
  const noteColor = doc.print?.note?.color;
  const noteItalic = doc.print?.note?.italic;
  const width = options?.width !== undefined ? options?.width : pageWidth || 0;
  const color = options?.color || formatState?.overrideColor || DEFAULT_COLOR;

  doc.fill(color);

  if (options?.highlight) {
    doc.highlight(
      x * SIZE_FACTOR,
      y * SIZE_FACTOR + doc.currentLineHeight() / 2,
      doc.widthOfString(text),
      doc.currentLineHeight(),
      { color: options?.highlightColor }
    );
  }

  if (noteItalic) {
    text = text.replace(REGEX_NOTE_START, "*[[").replace(REGEX_NOTE_END, "]]*");
  }
  const splitForFormatting = [];
  const leftover = text;
  if (leftover) {
    splitForFormatting.push(leftover);
  }

  //Further sub-split for bold, italic, underline, etc...
  for (let i = 0; i < splitForFormatting.length; i++) {
    const innerSplit = (splitForFormatting[i] || "")
      .split(REGEX_FORMAT_SPLITTER)
      .filter((a) => {
        return a;
      });
    splitForFormatting.splice(i, 1, ...innerSplit);
    i += innerSplit.length - 1;
  }

  const textObjects: {
    text: string;
    link: string | undefined;
    font: string;
    underline: string | boolean | undefined;
    color: string;
  }[] = [];
  let currentIndex = 0;
  for (let i = 0; i < splitForFormatting.length; i++) {
    let elem = splitForFormatting[i];
    if (!elem) {
      break;
    }
    if (elem === "***") {
      formatState.italic = !formatState.italic;
      formatState.bold = !formatState.bold;
    } else if (elem === "**") {
      formatState.bold = !formatState.bold;
    } else if (elem === "*") {
      formatState.italic = !formatState.italic;
    } else if (elem === "_") {
      formatState.underline = !formatState.underline;
    } else if (elem === "[[") {
      formatState.overrideColor = noteColor || DEFAULT_COLOR;
    } else if (elem === "]]") {
      formatState.overrideColor = undefined;
    } else {
      const bold = formatState.bold || options?.bold;
      const italic = formatState.italic || options?.italic;
      let font = normalFontKey;
      if (bold && italic) {
        font = bolditalicFontKey;
      } else if (bold) {
        font = boldFontKey;
      } else if (italic) {
        font = italicFontKey;
      }
      if (elem === "\\_" || elem === "\\*") {
        elem = elem.substring(1, 1);
      }
    }
    currentIndex += elem.length;
  }
  doc.textBox?.(
    textObjects,
    x * SIZE_FACTOR,
    y * SIZE_FACTOR,
    width * SIZE_FACTOR,
    {
      lineBreak: options?.lineBreak,
      align: options?.align,
      baseline: "top",
    }
  );
};
