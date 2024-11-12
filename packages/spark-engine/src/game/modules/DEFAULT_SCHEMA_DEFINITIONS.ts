import { audioSchemaDefinitions } from "./audio/audioSchemaDefinitions";
import { uiSchemaDefinitions } from "./ui/uiSchemaDefinitions";
import { interpreterSchemaDefinitions } from "./interpreter/interpreterSchemaDefinitions";
import { combineStructMap } from "../core/utils/combineStructMap";

export const DEFAULT_SCHEMA_DEFINITIONS = combineStructMap(
  uiSchemaDefinitions(),
  audioSchemaDefinitions(),
  interpreterSchemaDefinitions()
);
