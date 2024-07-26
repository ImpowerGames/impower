import { audioBuiltins } from "./audio/audioBuiltins";
import { uiBuiltins } from "./ui/uiBuiltins";
import { combineBuiltins } from "./interpreter/utils/combineBuiltins";
import { interpreterBuiltins } from "./interpreter/interpreterBuiltins";

export const DEFAULT_BUILTINS = combineBuiltins(
  uiBuiltins(),
  audioBuiltins(),
  interpreterBuiltins()
);
