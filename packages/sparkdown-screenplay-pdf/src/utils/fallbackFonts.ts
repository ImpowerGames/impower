import type PDFKit from "pdfkit";
import { create } from "fontkit";
import { type FallbackFontFaces, fallbackScriptOf, RIGHT_TO_LEFT } from "./fallbackFontSources";
import { noteUnprintable } from "./unprintableCharacters";

export interface FaceRun {
  text: string;
  font?: string;
  fallback: boolean;
}

interface GlyphCoverage {
  postscriptName?: string;
  hasGlyphForCodePoint(codePoint: number): boolean;
}

interface FallbackFamily {
  script?: string;
  normal: string;
  bold?: string;
}

interface FaceSet {
  coverage: Map<string, GlyphCoverage>;
  faceNames: Map<string, string>;
  families: FallbackFamily[];
  choices: Map<string, Map<number, string | null>>;
}

const KEPT_IN_PRIMARY = /[\s\p{Cc}]/u;

const BOLD_FACES = new Set(["bold", "bolditalic"]);

const ITALIC_FACES = new Set(["italic", "bolditalic"]);

const FALLBACK_OBLIQUE = 12;

const faceSets = new WeakMap<PDFKit.PDFDocument, FaceSet>();

const coverageOf = (bytes: ArrayBuffer): GlyphCoverage | undefined => {
  try {
    const font = create(Buffer.from(bytes) as Buffer);
    return "hasGlyphForCodePoint" in font ? font : undefined;
  } catch {
    return undefined;
  }
};

export const registerFallbackFonts = (
  doc: PDFKit.PDFDocument,
  faces: Record<string, ArrayBuffer | undefined>,
  fallbacks: FallbackFontFaces[] | undefined,
): void => {
  const coverage = new Map<string, GlyphCoverage>();
  const families: FallbackFamily[] = [];
  for (const [index, family] of (fallbacks ?? []).entries()) {
    const normal = `fallback-${index}`;
    const normalCoverage = coverageOf(family.normal);
    if (!normalCoverage) {
      continue;
    }
    doc.registerFont(normal, family.normal);
    coverage.set(normal, normalCoverage);
    const bold = family.bold ? `fallback-${index}-bold` : undefined;
    const boldCoverage = family.bold ? coverageOf(family.bold) : undefined;
    if (bold && family.bold && boldCoverage) {
      doc.registerFont(bold, family.bold);
      coverage.set(bold, boldCoverage);
      families.push({ script: family.script, normal, bold });
    } else {
      families.push({ script: family.script, normal });
    }
  }
  if (families.length === 0) {
    return;
  }
  const faceNames = new Map<string, string>();
  for (const [name, bytes] of Object.entries(faces)) {
    const faceCoverage = bytes ? coverageOf(bytes) : undefined;
    if (faceCoverage) {
      coverage.set(name, faceCoverage);
      if (faceCoverage.postscriptName && !faceNames.has(faceCoverage.postscriptName)) {
        faceNames.set(faceCoverage.postscriptName, name);
      }
    }
  }
  faceSets.set(doc, { coverage, faceNames, families, choices: new Map() });
};

const fallbackFor = (set: FaceSet, font: string, codePoint: number): string | null => {
  let choices = set.choices.get(font);
  if (!choices) {
    choices = new Map();
    set.choices.set(font, choices);
  }
  const known = choices.get(codePoint);
  if (known !== undefined) {
    return known;
  }
  let choice: string | null = null;
  const primary = set.coverage.get(font);
  const character = String.fromCodePoint(codePoint);
  if (
    primary &&
    !primary.hasGlyphForCodePoint(codePoint) &&
    !KEPT_IN_PRIMARY.test(character) &&
    !RIGHT_TO_LEFT.test(character)
  ) {
    const bold = BOLD_FACES.has(font);
    const script = fallbackScriptOf(character);
    const ordered = [
      ...set.families.filter((family) => family.script === script),
      ...set.families.filter((family) => family.script !== script),
    ];
    for (const family of ordered) {
      const name = bold && family.bold ? family.bold : family.normal;
      if (set.coverage.get(name)?.hasGlyphForCodePoint(codePoint)) {
        choice = name;
        break;
      }
    }
  }
  choices.set(codePoint, choice);
  return choice;
};

export const currentFaceName = (doc: PDFKit.PDFDocument): string | undefined => {
  const name = (doc as unknown as { _font?: { name?: string } })._font?.name;
  return name == null ? undefined : faceSets.get(doc)?.faceNames.get(name);
};

export const faceRuns = (doc: PDFKit.PDFDocument, text: string, font: string | undefined): FaceRun[] => {
  const set = faceSets.get(doc);
  if (!set || font == null || !set.coverage.has(font)) {
    return [{ text, font, fallback: false }];
  }
  const runs: FaceRun[] = [];
  for (const character of text) {
    const fallback = fallbackFor(set, font, character.codePointAt(0)!);
    const runFont = fallback ?? font;
    const last = runs.at(-1);
    if (last && last.font === runFont) {
      last.text += character;
    } else {
      runs.push({ text: character, font: runFont, fallback: fallback != null });
    }
  }
  return runs.length > 0 ? runs : [{ text, font, fallback: false }];
};

export const fallbackOblique = (font: string | undefined, oblique: number | undefined): number | undefined =>
  font != null && ITALIC_FACES.has(font) ? FALLBACK_OBLIQUE : oblique;

interface AdvanceSource {
  unitsPerEm: number;
  glyphForCodePoint(codePoint: number): { advanceWidth: number };
}

export const fallbackRunWidth = (doc: PDFKit.PDFDocument, text: string): number => {
  const state = doc as unknown as { _font: { font: AdvanceSource }; _fontSize: number };
  const font = state._font.font;
  let units = 0;
  for (const character of text) units += font.glyphForCodePoint(character.codePointAt(0)!).advanceWidth;
  return (units / font.unitsPerEm) * state._fontSize;
};

export const decorateFallbackRun = (
  doc: PDFKit.PDFDocument,
  primary: string,
  x: number,
  y: number,
  width: number,
  decoration: { underline?: boolean; strike?: boolean },
): void => {
  if (!decoration.underline && !decoration.strike) {
    return;
  }
  doc.font(primary);
  const state = doc as unknown as { _fontSize: number; _fillColor?: unknown[] };
  const lineHeight = doc.currentLineHeight();
  const lineWidth = state._fontSize < 10 ? 0.5 : Math.floor(state._fontSize / 10);
  doc.save();
  (doc.strokeColor as (...color: unknown[]) => PDFKit.PDFDocument)(...(state._fillColor ?? []));
  doc.lineWidth(lineWidth);
  if (decoration.underline) {
    doc.moveTo(x, y + lineHeight - lineWidth).lineTo(x + width, y + lineHeight - lineWidth).stroke();
  }
  if (decoration.strike) {
    doc.moveTo(x, y + lineHeight / 2).lineTo(x + width, y + lineHeight / 2).stroke();
  }
  doc.restore();
};

export interface FaceRunStyle {
  link?: string;
  lineBreak?: boolean;
  oblique?: number;
  underline?: boolean;
  strike?: boolean;
}

export const drawFaceRuns = (
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  font: string | undefined,
  style: FaceRunStyle,
  baseline: string | number,
  fontSize: number,
): number => {
  let runX = x;
  const runs = faceRuns(doc, text, font);
  for (const run of runs) {
    const primary = run.fallback ? font : undefined;
    const runBaseline = primary != null ? baselineShift(doc, primary, baseline, fontSize) : baseline;
    if (run.font != null) {
      doc.font(run.font);
    }
    noteUnprintable(doc, run.text);
    const options: PDFKit.Mixins.TextOptions = {
      link: style.link,
      align: "left",
      ...(style.lineBreak != null ? { lineBreak: style.lineBreak } : {}),
      baseline: runBaseline as keyof PDFKit.Mixins.TextOptions["baseline"],
      oblique: run.fallback ? fallbackOblique(font, style.oblique) : style.oblique,
      underline: run.fallback ? false : style.underline,
      strike: run.fallback ? false : style.strike,
    };
    doc.text(run.text, runX, y, options);
    const drawn = doc.widthOfString(run.text, options);
    const advance = run.fallback ? Math.max(fallbackRunWidth(doc, run.text), drawn) : drawn;
    if (primary != null) {
      decorateFallbackRun(doc, primary, runX, y, advance, style);
    }
    runX += advance;
  }
  if (font != null && runs.some((run) => run.fallback)) {
    doc.font(font);
  }
  return runX;
};

interface FontMetrics {
  ascender: number;
  descender: number;
  xHeight: number;
}

export const baselineShift = (
  doc: PDFKit.PDFDocument,
  primary: string,
  baseline: string | number,
  fontSize: number,
): number => {
  if (typeof baseline === "number") {
    return baseline;
  }
  doc.font(primary);
  const metrics = (doc as unknown as { _font: FontMetrics })._font;
  const offsets: Record<string, number> = {
    "svg-middle": 0.5 * metrics.xHeight,
    middle: 0.5 * (metrics.descender + metrics.ascender),
    "svg-central": 0.5 * (metrics.descender + metrics.ascender),
    bottom: metrics.descender,
    ideographic: metrics.descender,
    alphabetic: 0,
    mathematical: 0.5 * metrics.ascender,
    hanging: 0.8 * metrics.ascender,
    top: metrics.ascender,
  };
  return -((offsets[baseline] ?? metrics.ascender) / 1000) * fontSize;
};
