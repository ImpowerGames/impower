import { audioBuiltins } from "./audio/audioBuiltins";
import { uiBuiltins } from "./ui/uiBuiltins";
import { interpreterBuiltins } from "./interpreter/interpreterBuiltins";
import { combineBuiltins } from "../core/utils/combineBuiltins";

export const DEFAULT_BUILTINS = combineBuiltins(
  uiBuiltins(),
  audioBuiltins(),
  interpreterBuiltins()
);
