import type { ScriptFace } from "@impower/sparkdown-screenplay/src/constants/SCRIPT_FONT_ADVANCES";
import { printsWithFallback } from "@impower/sparkdown-screenplay/src/utils/scriptFontAdvance";
import {
  FALLBACK_FONT_SOURCES,
  type FallbackFontFaces,
  type FallbackFontSource,
  fallbackFontSourcesFor,
  fallbackScriptOf,
} from "./fallbackFontSources";
import { fontCoverage } from "./fontCoverage";

const FACES: ScriptFace[] = ["normal", "bold", "italic", "bolditalic"];

const CJK_BACKSTOP = FALLBACK_FONT_SOURCES.find((source) => source.region === "chinese")!;

export const charactersNeedingFallback = (scripts: string[]): Set<string> => {
  const characters = new Set<string>();
  const seen = new Set<string>();
  for (const script of scripts) {
    for (const character of script) {
      if (seen.has(character)) continue;
      seen.add(character);
      const codePoint = character.codePointAt(0)!;
      if (FACES.some((face) => printsWithFallback(face, codePoint))) characters.add(character);
    }
  }
  return characters;
};

export const loadFallbackFonts = async (
  scripts: string[],
  fetchFont: (url: string) => Promise<ArrayBuffer | undefined>,
): Promise<FallbackFontFaces[]> => {
  const attempt = (url: string) => fetchFont(url).catch(() => undefined);
  const load = async (source: FallbackFontSource) => {
    const [normal, bold] = await Promise.all([attempt(source.normal), attempt(source.bold)]);
    return normal ? { source, normal, ...(bold ? { bold } : {}) } : undefined;
  };
  const characters = charactersNeedingFallback(scripts);
  const sources = fallbackFontSourcesFor(characters);
  const loaded = (await Promise.all(sources.map(load))).filter((family) => family != null);
  if (!sources.includes(CJK_BACKSTOP)) {
    const regional = loaded.filter((family) => family.source.script === "cjk").map((family) => fontCoverage(family.normal));
    const lacked = [...characters].some(
      (character) =>
        fallbackScriptOf(character) === "cjk" &&
        !regional.some((covers) => covers(character.codePointAt(0)!)),
    );
    if (lacked) {
      const backstop = await load(CJK_BACKSTOP);
      if (backstop) loaded.push(backstop);
    }
  }
  return loaded.map(({ normal, bold }) => ({ normal, ...(bold ? { bold } : {}) }));
};
