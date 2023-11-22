import { SparkCharacterMetadata } from "./SparkCharacterMetadata";
import { SparkColorMetadata } from "./SparkColorMetadata";
import { SparkLineMetadata } from "./SparkLineMetadata";
import { SparkSceneMetadata } from "./SparkSceneMetadata";
import { StructureItem } from "./StructureItem";

export interface SparkProgramMetadata {
  lines?: SparkLineMetadata[];
  scenes?: SparkSceneMetadata[];
  colors?: SparkColorMetadata[];
  characters?: Record<string, SparkCharacterMetadata>;

  structure?: Record<string, StructureItem>;

  dialogueDuration?: number;
  actionDuration?: number;

  parseTime?: number;
  parseDuration?: number;
  lineCount?: number;
}
