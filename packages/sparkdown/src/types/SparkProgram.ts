import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkProgramMetadata } from "./SparkProgramMetadata";
import { SparkSection } from "./SparkSection";
import { SparkStruct } from "./SparkStruct";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkProgram {
  files?: {
    name: string;
    src: string;
    ext: string;
    type: string;
  }[];

  tokens: SparkToken[];

  frontMatter?: Record<string, string[]>;
  sections: Record<string, SparkSection>;
  structs?: Record<string, SparkStruct>;
  variables?: Record<string, SparkVariable>;

  diagnostics: SparkDiagnostic[];
  metadata: SparkProgramMetadata;
}
