import { coreBuiltinDefinitions } from "../core/coreBuiltinDefinitions";
import { audioBuiltinDefinitions } from "./audio/audioBuiltinDefinitions";
import { uiBuiltinDefinitions } from "./ui/uiBuiltinDefinitions";
import { interpreterBuiltinDefinitions } from "./interpreter/interpreterBuiltinDefinitions";
import { combineStructMap } from "../core/utils/combineStructMap";

export const DEFAULT_BUILTIN_DEFINITIONS = combineStructMap(
  coreBuiltinDefinitions(),
  uiBuiltinDefinitions(),
  audioBuiltinDefinitions(),
  interpreterBuiltinDefinitions()
);
