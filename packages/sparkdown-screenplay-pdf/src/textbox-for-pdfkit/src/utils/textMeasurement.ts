import type PDFKit from "pdfkit";
import { FormattedText } from "../types/FormattedText";

// All these functions here measure some kind of text.
// What kind of text they measure can easily be taken from
// the respective function names.
// Basically all functions use the "measureTextWidth" function
// which uses the "widthOfString" function of pdfKit document.

export const measureTextWidth = (
  textFragment: FormattedText,
  doc: PDFKit.PDFDocument
) => {
  if (textFragment.font != null) {
    doc.font(textFragment.font);
  }
  if (textFragment.fontSize != null) {
    doc.fontSize(textFragment.fontSize);
  }
  return doc.widthOfString(textFragment.text, {
    link: textFragment.link,
    align: "left",
    baseline: textFragment.baseline || "alphabetic",
    oblique: textFragment.oblique,
    underline: textFragment.underline,
    strike: textFragment.strike,
  });
};

export const measureTextsWidth = (
  texts: FormattedText[],
  doc: PDFKit.PDFDocument
) => {
  const textsWithWidth = texts.map((textPart) => {
    textPart.width = measureTextWidth(textPart, doc);
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
  textArray: FormattedText[],
  spaceWidth: number,
  doc: PDFKit.PDFDocument
) => {
  return textArray.map((textFragment) => {
    if (textFragment.text === " ") {
      return {
        text: textFragment.text,
        width: spaceWidth,
      };
    }
    return {
      text: textFragment.text,
      width: measureTextWidth(textFragment, doc),
    };
  });
};
