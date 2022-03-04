import { FountainAsset } from "./FountainAsset";
import { FountainDiagnostic } from "./FountainDiagnostic";
import { FountainSection } from "./FountainSection";
import { FountainTag } from "./FountainTag";
import { FountainToken } from "./FountainToken";
import { FountainVariable } from "./FountainVariable";
import { ScreenplayProperties } from "./ScreenplayProperties";

export interface FountainParseResult {
  titleTokens?: { [key: string]: FountainToken[] };
  scriptTokens: FountainToken[];
  scriptLines: Record<number, number>;
  sectionLines?: Record<number, string>;
  sections?: Record<string, FountainSection>;
  variables?: Record<string, FountainVariable>;
  tags?: Record<string, FountainTag>;
  assets?: Record<string, FountainAsset>;
  properties?: ScreenplayProperties;
  diagnostics?: FountainDiagnostic[];
}
