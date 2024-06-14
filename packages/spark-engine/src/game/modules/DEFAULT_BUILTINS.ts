import { audioBuiltins } from "./audio/audioBuiltins";
import { uiBuiltins } from "./ui/uiBuiltins";
import { combineBuiltins } from "./writer/utils/combineBuiltins";
import { writerBuiltins } from "./writer/writerBuiltins";

export const DEFAULT_BUILTINS = combineBuiltins(
  uiBuiltins(),
  audioBuiltins(),
  writerBuiltins()
);
