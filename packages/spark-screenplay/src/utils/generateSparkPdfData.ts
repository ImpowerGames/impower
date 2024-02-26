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
  const lines = typesetter.layout(tokens, print, config);

  const data: PdfData = {
    frontMatter,
    lines,
    print,
    config,
    fonts,
  };
  return data;
};
