import type { File } from "./File";
import type { SparkdownCompilerDefinitions } from "./SparkdownCompilerDefinitions";

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
}
