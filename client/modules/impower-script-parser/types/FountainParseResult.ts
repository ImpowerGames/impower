import { FountainDeclarations } from "./FountainDeclarations";
import { FountainDiagnostic } from "./FountainDiagnostic";
import { FountainSection } from "./FountainSection";
import { FountainToken } from "./FountainToken";
import { ScreenplayProperties } from "./ScreenplayProperties";

export interface FountainParseResult extends FountainDeclarations {
  titleTokens?: { [key: string]: FountainToken[] };
  scriptTokens: FountainToken[];
  scriptLines: Record<number, number>;
  sectionLines?: Record<number, string>;
  properties?: ScreenplayProperties;
  diagnostics?: FountainDiagnostic[];
  sections?: Record<string, FountainSection>;
}
