import { ScreenplayConfig } from "../types/ScreenplayConfig";

export const isHiddenIdentifier = (
  tag: string | undefined,
  config?: ScreenplayConfig,
): boolean =>
  (tag === "function" && !config?.screenplay_print_function_identifiers) ||
  (tag === "scene" && !config?.screenplay_print_scene_identifiers) ||
  (tag === "branch" && !config?.screenplay_print_branch_identifiers) ||
  (tag === "knot" && !config?.screenplay_print_knot_identifiers) ||
  (tag === "stitch" && !config?.screenplay_print_stitch_identifiers);
