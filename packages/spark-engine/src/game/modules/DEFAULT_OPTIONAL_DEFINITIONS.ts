import { uiOptionalDefinitions } from "./ui/uiOptionalDefinitions";
import { combineStructMap } from "../core/utils/combineStructMap";

export const DEFAULT_OPTIONAL_DEFINITIONS = combineStructMap(
  uiOptionalDefinitions()
);
