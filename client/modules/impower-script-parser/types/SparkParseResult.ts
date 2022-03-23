import { ScreenplayProperties } from "./ScreenplayProperties";
import { SparkDeclarations } from "./SparkDeclarations";
import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkReference } from "./SparkReference";
import { SparkSection } from "./SparkSection";
import { SparkToken } from "./SparkToken";

export interface SparkParseResult extends SparkDeclarations {
  titleTokens?: { [key: string]: SparkToken[] };
  scriptTokens: SparkToken[];
  scriptLines: Record<number, number>;
  diagnostics: SparkDiagnostic[];
  references: Record<number, SparkReference[]>;
  sectionLines?: Record<number, string>;
  dialogueLines?: Record<number, string>;
  properties?: ScreenplayProperties;
  sections?: Record<string, SparkSection>;
}
