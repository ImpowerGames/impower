import { SPARK_REGEX } from "../../../sparkdown/src";
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
  const links: { start: number; length: number; url: string }[] = [];
  if (options?.links) {
    let match;
    //Clean up all the links, while keeping track of their offset in order to add them back in later.
    while ((match = SPARK_REGEX.link.exec(text)) !== null) {
      match.index;
      const trimmed = match[3];
      links.push({
        start: match.index,
        length: trimmed?.length || 0,
        url: match[6] || "",
      });
      text =
        text.slice(0, match.index) +
        match[3] +
        text.slice(match.index + (match[0]?.length || 0));
    }
  }
  const splitForFormatting = [];
  //Split the text from the start (or from the previous link) until the current one
  //"This is a link: google.com and this is after"
  // |--------------|----------| - - - - - - - |
  let prevLink = 0;
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link) {
      splitForFormatting.push(text.slice(prevLink, link.start));
      splitForFormatting.push(text.slice(link.start, link.start + link.length));
      prevLink = link.start + link.length;
    }
  }
  //...And then add whatever is left over
  //"This is a link: google.com and this is after"
  // | - - - - - - -| - - - - -|----------------|
  const leftover = text.slice(prevLink, text.length);
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

  const textObjects = [];
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
      let linkUrl = undefined;
      for (const link of links) {
        if (
          link.start <= currentIndex &&
          currentIndex < link.start + link.length
        ) {
          linkUrl = link.url;
        }
      }
      textObjects.push({
        text: elem,
        link: linkUrl,
        font: font,
        underline: linkUrl || formatState.underline,
        color: formatState.overrideColor || DEFAULT_COLOR,
      });
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
