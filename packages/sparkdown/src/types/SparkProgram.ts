import { SparkChunk } from "./SparkChunk";
import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkProgramMetadata } from "./SparkProgramMetadata";
import { SparkSection } from "./SparkSection";
import { SparkStruct } from "./SparkStruct";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkProgram {
  frontMatter?: Record<string, string[]>;
  chunks: Record<string, SparkChunk>;
  sections: Record<string, SparkSection>;
  structs?: Record<string, SparkStruct>;
  variables?: Record<string, SparkVariable>;

  tokens: SparkToken[];

  typeMap?: { [type: string]: { [name: string]: any } };

  metadata: SparkProgramMetadata;
  diagnostics?: SparkDiagnostic[];
}
