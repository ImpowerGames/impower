import type PDFKit from "pdfkit";

interface GlyphCoverage {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

const UNMARKED = /[\s\p{Cc}]/u;

const logs = new WeakMap<PDFKit.PDFDocument, Set<string>>();

export const startUnprintableLog = (doc: PDFKit.PDFDocument): Set<string> => {
  const log = new Set<string>();
  logs.set(doc, log);
  return log;
};

export const noteUnprintable = (doc: PDFKit.PDFDocument, text: string): void => {
  const log = logs.get(doc);
  const face = (doc as unknown as { _font?: { font?: Partial<GlyphCoverage> } })._font?.font;
  if (!log || typeof face?.hasGlyphForCodePoint !== "function") {
    return;
  }
  for (const character of text) {
    if (log.has(character) || UNMARKED.test(character)) {
      continue;
    }
    if (!face.hasGlyphForCodePoint(character.codePointAt(0)!)) {
      log.add(character);
    }
  }
};
