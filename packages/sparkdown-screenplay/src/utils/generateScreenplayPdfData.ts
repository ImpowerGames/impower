import { ScreenplayTypesetter } from "../classes/ScreenplayTypesetter";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import { PdfData } from "../types/PdfData";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { ScreenplayConfig } from "../types/ScreenplayConfig";

export const generateScreenplayPdfData = (
  tokens: ScreenplayToken[],
  config?: ScreenplayConfig,
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  }
): PdfData => {
  const print =
    PRINT_PROFILES[config?.screenplay_print_profile || ""] ||
    PRINT_PROFILES.usletter;
  const typesetter = new ScreenplayTypesetter();
  const spans = typesetter.compose(tokens, config, print);
  const info = typesetter.getInfo(spans);
  return {
    info,
    spans,
    print,
    config,
    fonts,
  };
};
