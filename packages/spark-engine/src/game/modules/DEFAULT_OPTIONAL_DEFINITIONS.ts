import { combineStructMap } from "../core/utils/combineStructMap";
import { interpreterOptionalDefinitions } from "./interpreter/interpreterOptionalDefinitions";
import { uiOptionalDefinitions } from "./ui/uiOptionalDefinitions";

export const DEFAULT_OPTIONAL_DEFINITIONS = combineStructMap(
  interpreterOptionalDefinitions(),
  uiOptionalDefinitions(),
);
