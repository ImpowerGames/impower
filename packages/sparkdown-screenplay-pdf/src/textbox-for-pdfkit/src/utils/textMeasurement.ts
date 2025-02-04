import type PDFKit from "pdfkit";
import { FormattedText } from "../types/FormattedText";

// All these functions here measure some kind of text.
// What kind of text they measure can easily be taken from
// the respective function names.
// Basically all functions use the "measureTextWidth" function
// which uses the "widthOfString" function of pdfKit document.

export const measureTextWidth = (
  text: string,
  font: string | undefined,
  fontSize: number | undefined,
  doc: PDFKit.PDFDocument
) => {
  if (font != null) {
    doc.font(font);
  }
  if (fontSize != null) {
    doc.fontSize(fontSize);
  }
  return doc.widthOfString(text);
};

export const measureTextsWidth = (
  texts: FormattedText[],
  doc: PDFKit.PDFDocument
) => {
  const textsWithWidth = texts.map((textPart) => {
    const { fontSize, font, text } = textPart;
    textPart.width = measureTextWidth(text, font, fontSize, doc);
    return textPart;
  });
  return textsWithWidth;
};

export const checkParagraphFitsInLine = (
  paragraph: FormattedText[],
  textWidth: number
) => {
  let paragraphWidth = 0;
  paragraph.forEach((textpart) => {
    if (textpart.width != null) {
      paragraphWidth += textpart.width;
    }
  });
  return paragraphWidth <= textWidth;
};

export const measureTextFragments = (
  textArray: string[],
  spaceWidth: number,
  font: string | undefined,
  fontSize: number | undefined,
  doc: PDFKit.PDFDocument
) => {
  return textArray.map((textFragment) => {
    if (textFragment === " ")
      return {
        text: textFragment,
        width: spaceWidth,
      };
    return {
      text: textFragment,
      width: measureTextWidth(textFragment, font, fontSize, doc),
    };
  });
};
