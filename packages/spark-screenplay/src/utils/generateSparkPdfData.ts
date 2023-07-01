import { SparkProgram, SparkSectionToken } from "../../../sparkdown/src";
import { Liner } from "../classes/Liner";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import { PdfData } from "../types/PdfData";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";

export const generateSparkPdfData = (
  program: SparkProgram,
  config: SparkScreenplayConfig,
  fonts: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  }
): PdfData => {
  let watermark = undefined;
  let header = undefined;
  let footer = undefined;
  if (program.frontMatter) {
    const hiddenTitleTokens = program.frontMatter["hidden"] || [];
    for (let index = 0; index < hiddenTitleTokens.length; index++) {
      const titleToken = hiddenTitleTokens[index];
      if (titleToken) {
        const text = titleToken.text?.trimEnd();
        if (titleToken.type === "watermark") {
          watermark = text;
        }
        if (titleToken.type === "header") {
          header = text;
        }
        if (titleToken.type === "footer") {
          footer = text;
        }
      }
    }
  }
  let currentIndex = 0;

  const titleTokens = program.frontMatter || {};
  const tokens = [...program.tokens];
  const sceneInvisibleSections: Record<string | number, SparkSectionToken[]> =
    {};
  // tidy up separators
  let invisibleSections = [];
  while (currentIndex < tokens.length) {
    const currentToken = tokens[currentIndex];
    if (!currentToken) {
      break;
    }
    if (
      currentToken.type === "dual_dialogue_start" ||
      currentToken.type === "dialogue_start" ||
      currentToken.type === "dialogue_end" ||
      currentToken.type === "dual_dialogue_end" ||
      (!config.screenplay_print_notes &&
        (currentToken.type === "note" ||
          currentToken.type === "assets" ||
          currentToken.type === "dialogue_asset" ||
          currentToken.type === "action_asset")) ||
      (!config.screenplay_print_sections && currentToken.type === "section") ||
      (!config.screenplay_print_synopses && currentToken.type === "synopsis")
    ) {
      if (currentToken.type === "section") {
        //on the next scene header, add an invisible section (for keeping track of sections when creating bookmarks and generating pdf-side)
        invisibleSections.push(currentToken);
      }
      tokens.splice(currentIndex, 1);
      continue;
    }
    if (currentToken.type === "scene") {
      if (invisibleSections.length > 0) {
        sceneInvisibleSections[currentToken.scene] = invisibleSections;
      }
      invisibleSections = [];
    }
    currentIndex++;
  }
  // clean separators at the end
  while (
    tokens.length > 0 &&
    tokens[program.tokens.length - 1]?.type === "separator"
  ) {
    tokens.pop();
  }

  if (!config.screenplay_print_watermark && watermark !== undefined) {
    config.screenplay_print_watermark = watermark;
  }
  if (!config.screenplay_print_header && header !== undefined) {
    config.screenplay_print_header = header;
  }
  if (!config.screenplay_print_footer && footer !== undefined) {
    config.screenplay_print_footer = footer;
  }

  const print =
    PRINT_PROFILES[config.screenplay_print_profile || ""] ||
    PRINT_PROFILES.usletter;

  const liner = new Liner();
  const lines = liner.line(tokens, print, config);

  const data: PdfData = {
    titleTokens,
    lines,
    print,
    config,
    fonts,
    sceneInvisibleSections,
  };
  return data;
};
