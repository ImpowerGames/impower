import type { Tree } from "@lezer/common";
import { screenplayTokens } from "../classes/ScreenplayParser";
import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import { PRINT_PROFILES } from "../constants/PRINT_PROFILES";
import type { ScreenplayConfig } from "../types/ScreenplayConfig";

export const screenplayBlankLines = (
  tree: Tree,
  script: string,
  config?: ScreenplayConfig,
): number[] => {
  const profile =
    PRINT_PROFILES[config?.screenplay_print_paper_size || ""] ||
    PRINT_PROFILES.usletter;
  const spans = new ScreenplayTypesetter().compose(
    screenplayTokens(tree, script),
    config,
    profile,
  );
  return spans.flatMap((span) =>
    span.tag === "separator" && span.from !== undefined ? [span.from] : [],
  );
};
