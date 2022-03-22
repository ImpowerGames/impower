import { FountainDeclarations } from "./FountainDeclarations";
import { FountainDiagnostic } from "./FountainDiagnostic";
import { FountainReference } from "./FountainReference";
import { FountainSection } from "./FountainSection";
import { FountainToken } from "./FountainToken";
import { ScreenplayProperties } from "./ScreenplayProperties";

export interface FountainParseResult extends FountainDeclarations {
  titleTokens?: { [key: string]: FountainToken[] };
  scriptTokens: FountainToken[];
  scriptLines: Record<number, number>;
  diagnostics: FountainDiagnostic[];
  references: Record<number, FountainReference[]>;
  sectionLines?: Record<number, string>;
  dialogueLines?: Record<number, string>;
  properties?: ScreenplayProperties;
  sections?: Record<string, FountainSection>;
}
