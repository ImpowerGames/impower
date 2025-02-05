import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import { ScreenplayPrintData } from "../types/ScreenplayPrintData";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { ScreenplayConfig } from "../types/ScreenplayConfig";

export const generateScreenplayPrintData = (
  tokens: ScreenplayToken[],
  config?: ScreenplayConfig,
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  }
): ScreenplayPrintData => {
  const print =
    PRINT_PROFILES[config?.screenplay_print_profile || ""] ||
    PRINT_PROFILES.usletter;
  const typesetter = new ScreenplayTypesetter();
  const spans = typesetter.compose(tokens, config, print);
  const info = typesetter.getInfo(spans);
  return {
    info,
    spans,
    profile: print,
    config,
    fonts,
  };
};
