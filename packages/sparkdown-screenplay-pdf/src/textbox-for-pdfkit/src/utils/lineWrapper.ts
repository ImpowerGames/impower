import type PDFKit from "pdfkit";
import LineBreaker from "linebreak";

import {
  measureTextFragments,
  measureTextWidth,
  checkParagraphFitsInLine,
} from "./textMeasurement";

import { createLine } from "./dataRearranger";
import { FormattedText } from "../types/FormattedText";
import { FormattedLine } from "../types/FormattedLine";

export const lineWrapParagraph = (
  paragraph: FormattedText[],
  textWidth: number,
  doc: PDFKit.PDFDocument,
) => {

  if (checkParagraphFitsInLine(paragraph, textWidth)) {
    return [createLine(paragraph)];
  }
  let spaceLeftInLine = textWidth;
  let line: FormattedText[] = [];
  let lines = [];
  paragraph.forEach((textpart) => {
    if (textpart.width != null && textpart.width <= spaceLeftInLine) {
      line.push(textpart);
      spaceLeftInLine -= textpart.width;
    } else {
      const wrappedLines = wrapTextInLines(
        textpart,
        spaceLeftInLine,
        textWidth,
        doc,
      );
      wrappedLines.forEach((wrappedLine, index, array) => {
        switch (index) {
          case 0:
            if (wrappedLine.text !== "") line.push(wrappedLine);
            if (line.length > 0) {
              lines.push([...line]);
              line = [];
              spaceLeftInLine = textWidth;
            }
            break;
          case array.length - 1:
            line.push(wrappedLine);
            spaceLeftInLine -= wrappedLine.width;
            break;
          default:
            lines.push([wrappedLine]);
            spaceLeftInLine = textWidth;
        }
      });
    }
  });
  if (line.length !== 0) lines.push([...line]);

  return lines.map((l) => {
    return createLine(l);
  });
};

export const getWordChunks = (str: string) => {
  const breaker = new LineBreaker(str);
  let last = 0;
  let bk;
  const chunks: string[] = [];
  while ((bk = breaker.nextBreak())) {
    const chunk = str.slice(last, bk.position);
    chunks.push(chunk);
    last = bk.position;
  }
  return chunks;
};

export const getCharChunks = (str: string) => {
  try {
    const segmenter = new Intl.Segmenter();
    return Array.from(segmenter.segment(str)).map((s) => s.segment);
  } catch {
    return [...str];
  }
};

export const wrapTextInLines = (
  textPart: FormattedText,
  widthLeft: number,
  widthTextbox: number,
  doc: PDFKit.PDFDocument,
) => {

  const { text } = textPart;
  const wordChunks = getWordChunks(text);
  const measuredTextChunks = measureTextFragments(
    wordChunks.map((text) => ({ ...textPart, text })),
    doc,
  );
  const lines = [{ ...textPart, text: "", width: 0 }];
  let spaceLeft = widthLeft;
  measuredTextChunks.forEach((measuredTextChunk) => {
    if (measuredTextChunk.minWidth <= spaceLeft) {
      lines.at(-1)!.text += measuredTextChunk.text;
      lines.at(-1)!.width += measuredTextChunk.fullWidth;
      spaceLeft -= measuredTextChunk.fullWidth;
    } else {
      spaceLeft = widthTextbox;
      lines.push({ ...textPart, text: "", width: 0 });
      if (measuredTextChunk.minWidth <= spaceLeft) {
        lines.at(-1)!.text += measuredTextChunk.text;
        lines.at(-1)!.width += measuredTextChunk.fullWidth;
        spaceLeft -= measuredTextChunk.fullWidth;
      } else {
        const charChunks = getCharChunks(measuredTextChunk.text);
        measureTextFragments(
          charChunks.map((text) => ({ ...textPart, text })),
          doc,
        ).forEach((measuredCharChunk) => {
          if (measuredCharChunk.minWidth <= spaceLeft) {
            lines.at(-1)!.text += measuredCharChunk.text;
            lines.at(-1)!.width += measuredCharChunk.fullWidth;
            spaceLeft -= measuredCharChunk.fullWidth;
          } else {
            spaceLeft = widthTextbox;
            lines.push({ ...textPart, text: "", width: 0 });
            lines.at(-1)!.text += measuredCharChunk.text;
            lines.at(-1)!.width += measuredCharChunk.fullWidth;
            spaceLeft -= measuredCharChunk.fullWidth;
          }
        });
      }
    }
  });
  return lines;
};

export const removeTrailingSpaces = (
  lines: FormattedLine[],
  doc: PDFKit.PDFDocument,
) => {
  return lines.map((line) => {
    const lastText = line.texts[line.texts.length - 1];
    if (lastText) {
      if (!lastText.removeTrailingSpaces) {
        return line;
      }
      if (lastText.text.substring(lastText.text.length - 1) !== " ") {
        return line;
      }
      const newLastText = lastText.text.substring(0, lastText.text.length - 1);
      const newLastTextWidth = measureTextWidth(
        { ...lastText, text: newLastText },
        doc,
      );
      lastText.text = newLastText;
      lastText.width = newLastTextWidth;
    }
    let newLineWidth = 0;
    line.texts.forEach((text) => {
      if (text.width != null) {
        newLineWidth += text.width;
      }
    });
    line.width = newLineWidth;
    return line;
  });
};
