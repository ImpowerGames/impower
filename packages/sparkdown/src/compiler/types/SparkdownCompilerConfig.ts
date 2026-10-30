import type { File } from "./File";
import type { SparkdownCompilerDefinitions } from "./SparkdownCompilerDefinitions";
import type { StartingValues } from "../../program/startingValueLiterals";

export interface SparkdownCompilerConfig {
  definitions?: SparkdownCompilerDefinitions;
  files?: File[];
  skipValidation?: boolean;
  useBuiltinsPrelude?: boolean;
  seedBuiltinsIntoStory?: boolean;
  stripImageData?: boolean;
  workspace?: string;
  mainScriptFilename?: string;
  uriPathsAsWritten?: boolean;
  startFrom?: { file: string; line: number };
  startingValues?: StartingValues;
}
