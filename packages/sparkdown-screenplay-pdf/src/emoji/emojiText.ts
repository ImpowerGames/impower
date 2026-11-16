import type PDFKit from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import EmojiSvgProvider from "./EmojiSvgProvider";

export const getEmojiProvider = (
  doc: PDFKit.PDFDocument,
): EmojiSvgProvider | undefined =>
  (doc as unknown as { __emojiProvider?: EmojiSvgProvider }).__emojiProvider;

export const setEmojiProvider = (
  doc: PDFKit.PDFDocument,
  provider: EmojiSvgProvider,
): void => {
  (doc as unknown as { __emojiProvider?: EmojiSvgProvider }).__emojiProvider =
    provider;
};

export const measureEmojiWidth = (
  provider: EmojiSvgProvider,
  cluster: string,
  fontSize: number,
): number => {
  const run = provider.getEmojiRun(cluster);
  return (run.advanceUnits * fontSize) / provider.unitsPerEm;
};

export const drawEmojiChunk = (
  doc: PDFKit.PDFDocument,
  provider: EmojiSvgProvider,
  cluster: string,
  x: number,
  y: number,
  fontSize: number,
  baseline: string,
): number => {
  const run = provider.getEmojiRun(cluster);
  const scale = fontSize / provider.unitsPerEm;
  const EMOJI_CENTER_SHIFT = 0.19;
  const topY =
    baseline === "top"
      ? y - EMOJI_CENTER_SHIFT * fontSize
      : y - (1 - EMOJI_CENTER_SHIFT) * fontSize;
  let penX = x;
  for (const glyph of run.glyphs) {
    const width = glyph.advanceWidth * scale;
    if (glyph.svg) {
      doc.save();
      try {
        SVGtoPDF(doc, glyph.svg, penX, topY, {
          width,
          height: fontSize,
          assumePt: true,
        });
      } catch {
      }
      doc.restore();
    }
    penX += width;
  }
  return penX;
};
