import type PDFKit from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import EmojiSvgProvider from "./EmojiSvgProvider";

// A single regex that matches whole RGI emoji sequences (ZWJ joins, skin-tone
// modifiers, flags, keycaps) as one unit. The `v` flag + `\p{RGI_Emoji}`
// property-of-strings is supported by modern V8 (Node 20+, Chromium 112+). If
// the runtime lacks it we simply never split, and emoji fall back to text.
let EMOJI_REGEX: RegExp | null = null;
try {
  EMOJI_REGEX = /\p{RGI_Emoji}/gv;
} catch {
  EMOJI_REGEX = null;
}

export interface EmojiTextRun {
  text: string;
  isEmoji: boolean;
}

/**
 * Split a string into alternating plain-text and emoji runs. Each emoji run is
 * exactly one RGI emoji cluster so it can be routed to the SVG renderer while
 * the surrounding text keeps flowing through the normal Courier pipeline.
 */
export const splitEmojiRuns = (text: string): EmojiTextRun[] => {
  if (!EMOJI_REGEX || !text) {
    return [{ text, isEmoji: false }];
  }
  const runs: EmojiTextRun[] = [];
  let last = 0;
  EMOJI_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = EMOJI_REGEX.exec(text))) {
    if (m.index > last) {
      runs.push({ text: text.slice(last, m.index), isEmoji: false });
    }
    runs.push({ text: m[0], isEmoji: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), isEmoji: false });
  }
  return runs.length ? runs : [{ text, isEmoji: false }];
};

/** The emoji provider stashed on the PDF document by buildPDF, if any. */
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

/** Width (in PDF points) an emoji cluster occupies at the given font size. */
export const measureEmojiWidth = (
  provider: EmojiSvgProvider,
  cluster: string,
  fontSize: number,
): number => {
  const run = provider.getEmojiRun(cluster);
  return (run.advanceUnits * fontSize) / provider.unitsPerEm;
};

/**
 * Draw an emoji cluster as vector art at (x, baselineOrTopY) and return the
 * advanced x. `baseline` matches the value passed to `doc.text`: "top" aligns
 * the emoji box with the text top; anything else aligns the emoji baseline with
 * the text baseline.
 */
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
  // Our per-glyph SVG viewBox is `0 -upem advance upem`, so the emoji box is one
  // em tall. Hanging it from the em-box top leaves emoji sitting low relative to
  // the letters; nudge it up so the box is centered on the text's cap height and
  // the emoji reads as vertically centered with the line.
  const EMOJI_CENTER_SHIFT = 0.19; // fraction of fontSize, tuned visually
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
        // ignore a single glyph that fails to render
      }
      doc.restore();
    }
    penX += width;
  }
  return penX;
};
