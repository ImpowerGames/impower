import { coreDescriptionDefinitions } from "../core/coreDescriptionDefinitions";
import { combineStructMap } from "../core/utils/combineStructMap";

export const DEFAULT_DESCRIPTION_DEFINITIONS = combineStructMap(
  coreDescriptionDefinitions()
);
