import type PDFKit from "pdfkit";
import { FormattedText } from "../types/FormattedText";
import { MeasuredText } from "../types/MeasuredText";
import { getEmojiProvider, measureEmojiWidth } from "../../../emoji/emojiText";
import { fallbackFeatures, faceRuns } from "../../../utils/fallbackFonts";

export const measureTextWidth = (
  textChunk: FormattedText,
  doc: PDFKit.PDFDocument,
) => {
  if (textChunk.isEmoji) {
    const provider = getEmojiProvider(doc);
    if (provider) {
      const fontSize =
        textChunk.fontSize ??
        (doc as unknown as { _fontSize?: number })._fontSize ??
        12;
      return measureEmojiWidth(provider, textChunk.text, fontSize);
    }
  }
  if (textChunk.fontSize != null) {
    doc.fontSize(textChunk.fontSize);
  }
  let width = 0;
  const runs = faceRuns(doc, textChunk.text, textChunk.font);
  for (const run of runs) {
    if (run.font != null) {
      doc.font(run.font);
    }
    width += doc.widthOfString(run.text, {
      link: textChunk.link,
      align: "left",
      baseline: textChunk.baseline || "alphabetic",
      oblique: textChunk.oblique,
      underline: textChunk.underline,
      strike: textChunk.strike,
      ...(run.fallback ? { features: fallbackFeatures } : {}),
    });
  }
  if (runs.some((run) => run.fallback) && textChunk.font != null) {
    doc.font(textChunk.font);
  }
  return width;
};

export const measureTextsWidth = (
  textChunks: FormattedText[],
  doc: PDFKit.PDFDocument,
) => {
  const textsWithWidth = textChunks.map((textChunk) => {
    textChunk.width = measureTextWidth(textChunk, doc);
    return textChunk;
  });
  return textsWithWidth;
};

export const measureTextFragments = (
  textChunks: FormattedText[],
  doc: PDFKit.PDFDocument,
): MeasuredText[] => {
  return textChunks.map((textChunk) => {
    return {
      text: textChunk.text,
      fullWidth: measureTextWidth(textChunk, doc),
      minWidth: measureTextWidth(
        { ...textChunk, text: textChunk.text.trimEnd() },
        doc,
      ),
    };
  });
};
