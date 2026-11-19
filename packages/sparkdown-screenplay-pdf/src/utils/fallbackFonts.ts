import type PDFKit from "pdfkit";
import { create } from "fontkit";
import { type FallbackFontFaces, fallbackScriptOf, RIGHT_TO_LEFT } from "./fallbackFontSources";

export interface FaceRun {
  text: string;
  font?: string;
  fallback: boolean;
}

interface GlyphCoverage {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

interface FallbackFamily {
  script?: string;
  normal: string;
  bold?: string;
}

interface FaceSet {
  coverage: Map<string, GlyphCoverage>;
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
  for (const [name, bytes] of Object.entries(faces)) {
    const faceCoverage = bytes ? coverageOf(bytes) : undefined;
    if (faceCoverage) {
      coverage.set(name, faceCoverage);
    }
  }
  faceSets.set(doc, { coverage, families, choices: new Map() });
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
