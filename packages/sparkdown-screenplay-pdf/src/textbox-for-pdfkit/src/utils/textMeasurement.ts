import type PDFKit from "pdfkit";
import { FormattedText } from "../types/FormattedText";
import { MeasuredText } from "../types/MeasuredText";

// All these functions here measure some kind of text.
// What kind of text they measure can easily be taken from
// the respective function names.
// Basically all functions use the "measureTextWidth" function
// which uses the "widthOfString" function of pdfKit document.

export const measureTextWidth = (
  textChunk: FormattedText,
  doc: PDFKit.PDFDocument
) => {
  if (textChunk.font != null) {
    doc.font(textChunk.font);
  }
  if (textChunk.fontSize != null) {
    doc.fontSize(textChunk.fontSize);
  }
  return doc.widthOfString(textChunk.text, {
    link: textChunk.link,
    align: "left",
    baseline: textChunk.baseline || "alphabetic",
    oblique: textChunk.oblique,
    underline: textChunk.underline,
    strike: textChunk.strike,
  });
};

export const measureTextsWidth = (
  textChunks: FormattedText[],
  doc: PDFKit.PDFDocument
) => {
  const textsWithWidth = textChunks.map((textChunk) => {
    textChunk.width = measureTextWidth(textChunk, doc);
    return textChunk;
  });
  return textsWithWidth;
};

export const checkParagraphFitsInLine = (
  textChunks: FormattedText[],
  textWidth: number
) => {
  let paragraphWidth = 0;
  textChunks.forEach((textChunk) => {
    if (textChunk.width != null) {
      paragraphWidth += textChunk.width;
    }
  });
  return paragraphWidth <= textWidth;
};

export const measureTextFragments = (
  textChunks: FormattedText[],
  doc: PDFKit.PDFDocument
): MeasuredText[] => {
  return textChunks.map((textChunk) => {
    return {
      text: textChunk.text,
      fullWidth: measureTextWidth(textChunk, doc),
      minWidth: measureTextWidth(
        { ...textChunk, text: textChunk.text.trimEnd() },
        doc
      ),
    };
  });
};
