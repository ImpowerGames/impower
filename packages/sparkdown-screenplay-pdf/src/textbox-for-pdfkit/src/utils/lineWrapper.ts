import type PDFKit from "pdfkit";
import { wrapParagraph } from "@impower/sparkdown-screenplay/src/utils/wrapRows";

import { measureTextWidth } from "./textMeasurement";

import { createLine } from "./dataRearranger";
import { FormattedText } from "../types/FormattedText";
import { FormattedLine } from "../types/FormattedLine";

export const lineWrapParagraph = (
  paragraph: FormattedText[],
  textWidth: number,
  doc: PDFKit.PDFDocument,
) =>
  wrapParagraph(paragraph, textWidth, (piece: FormattedText) =>
    measureTextWidth(piece, doc),
  ).map((line) => createLine(line));

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
