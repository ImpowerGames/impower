import { coreBuiltinDefinitions } from "../core/coreBuiltins";
import {
  audioBuiltinDefinitions,
  audioSchemaDefinitions,
  audioRandomDefinitions,
} from "./audio/audioBuiltins";
import {
  uiBuiltinDefinitions,
  uiSchemaDefinitions,
  uiRandomDefinitions,
} from "./ui/uiBuiltins";
import {
  interpreterBuiltinDefinitions,
  interpreterSchemaDefinitions,
} from "./interpreter/interpreterBuiltins";
import { combineBuiltins } from "../core/utils/combineBuiltins";

export const DEFAULT_BUILTINS = combineBuiltins(
  coreBuiltinDefinitions(),
  uiBuiltinDefinitions(),
  uiSchemaDefinitions(),
  uiRandomDefinitions(),
  audioBuiltinDefinitions(),
  audioSchemaDefinitions(),
  audioRandomDefinitions(),
  interpreterBuiltinDefinitions(),
  interpreterSchemaDefinitions()
);
