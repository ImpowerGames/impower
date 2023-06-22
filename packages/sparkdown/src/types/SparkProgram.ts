import { SparkDeclarations } from "./SparkDeclarations";
import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkProperties } from "./SparkProperties";
import { SparkReference } from "./SparkReference";
import { SparkSection } from "./SparkSection";
import { SparkToken } from "./SparkToken";

export interface SparkProgram extends SparkDeclarations {
  titleTokens?: Record<string, SparkToken[]>;
  tokens: SparkToken[];
  diagnostics: SparkDiagnostic[];
  references: Record<number, SparkReference[]>;
  tokenLines: Record<number, number>;
  sceneLines?: Record<number, number>;
  sectionLines?: Record<number, string>;
  dialogueLines?: Record<number, string>;
  properties?: SparkProperties;
  sections?: Record<string, SparkSection>;
  parseTime?: number;
}
