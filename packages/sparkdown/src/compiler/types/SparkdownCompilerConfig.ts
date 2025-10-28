import { File } from "./File";
import { SparkdownCompilerDefinitions } from "./SparkdownCompilerDefinitions";

export interface SparkdownCompilerConfig {
  definitions?: SparkdownCompilerDefinitions;
  files?: File[];
  skipValidation?: boolean;
  workspace?: string;
  startFrom?: { file: string; line: number };
  simulateChoices?: Record<string, (number | undefined)[]> | null;
}
