import { SparkDeclarations } from "./SparkDeclarations";
import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkProgramMetadata } from "./SparkProgramMetadata";
import { SparkSection } from "./SparkSection";
import { SparkStruct } from "./SparkStruct";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkProgram extends SparkDeclarations {
  frontMatter?: Record<string, SparkToken[]>;
  tokens: SparkToken[];
  scopes?: string[];
  sections?: Record<string, SparkSection>;
  variables?: Record<string, SparkVariable>;
  structs?: Record<string, SparkStruct>;
  objectMap?: {
    [type: string]: Record<string, any>;
  };
  diagnostics: SparkDiagnostic[];
  metadata: SparkProgramMetadata;
}
