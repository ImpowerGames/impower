import { SparkChunk } from "./SparkChunk";
import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkProgramMetadata } from "./SparkProgramMetadata";
import { SparkSection } from "./SparkSection";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkProgram {
  builtins?: { [type: string]: { [name: string]: any } };

  frontMatter?: Record<string, string[]>;
  chunks: Record<string, SparkChunk>;
  sections: Record<string, SparkSection>;
  variables?: Record<string, SparkVariable>;

  tokens: SparkToken[];
  context: { [type: string]: { [name: string]: any } };
  stored?: string[];

  metadata: SparkProgramMetadata;
  diagnostics?: SparkDiagnostic[];
  version?: number;
}
