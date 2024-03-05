import type { SparkToken } from "../../../sparkdown/src";
import { Typesetter } from "../classes/Typesetter";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import { PdfData } from "../types/PdfData";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";

export const generateSparkPdfData = (
  frontMatter: Record<string, string[]>,
  tokens: SparkToken[],
  config: SparkScreenplayConfig,
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  }
): PdfData => {
  const print =
    PRINT_PROFILES[config.screenplay_print_profile || ""] ||
    PRINT_PROFILES.usletter;
  const typesetter = new Typesetter();
  return {
    info: typesetter.getInfo(frontMatter),
    frontMatterSpans: typesetter.formatFrontMatter(frontMatter),
    bodySpans: typesetter.formatBody(tokens, print, config),
    print,
    config,
    fonts,
  };
};
