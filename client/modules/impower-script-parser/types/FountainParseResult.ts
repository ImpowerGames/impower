import { FountainVariable } from "..";
import { FountainDiagnostic } from "./FountainDiagnostic";
import { FountainSection } from "./FountainSection";
import { FountainToken } from "./FountainToken";
import { ScreenplayProperties } from "./ScreenplayProperties";

export interface FountainParseResult {
  titleTokens?: { [key: string]: FountainToken[] };
  scriptTokens: FountainToken[];
  scriptLines: Record<number, number>;
  sections?: Record<string, FountainSection>;
  variables?: Record<string, FountainVariable & { line: number }>;
  properties?: ScreenplayProperties;
  diagnostics?: FountainDiagnostic[];
}
