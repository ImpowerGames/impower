import { audioRandomDefinitions } from "./audio/audioRandomDefinitions";
import { uiRandomDefinitions } from "./ui/uiRandomDefinitions";
import { combineStructMap } from "../core/utils/combineStructMap";

export const DEFAULT_RANDOM_DEFINITIONS = combineStructMap(
  uiRandomDefinitions(),
  audioRandomDefinitions()
);
