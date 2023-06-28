import { SparkDeclarations } from "./SparkDeclarations";
import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkProgramMetadata } from "./SparkProgramMetadata";
import { SparkSection } from "./SparkSection";
import { SparkToken } from "./SparkToken";

export interface SparkProgram extends SparkDeclarations {
  scopes?: string[];
  titleTokens?: Record<string, SparkToken[]>;
  tokens: SparkToken[];
  sections?: Record<string, SparkSection>;
  diagnostics: SparkDiagnostic[];
  metadata: SparkProgramMetadata;
}
