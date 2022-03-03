import { FountainVariable } from "..";
import { FountainAsset } from "./FountainAsset";
import { FountainDiagnostic } from "./FountainDiagnostic";
import { FountainSection } from "./FountainSection";
import { FountainToken } from "./FountainToken";
import { ScreenplayProperties } from "./ScreenplayProperties";

export interface FountainParseResult {
  titleTokens?: { [key: string]: FountainToken[] };
  scriptTokens: FountainToken[];
  scriptLines: Record<number, number>;
  sectionLines?: Record<number, string>;
  sections?: Record<string, FountainSection>;
  variables?: Record<string, FountainVariable>;
  assets?: {
    image?: Record<string, FountainAsset>;
    video?: Record<string, FountainAsset>;
    audio?: Record<string, FountainAsset>;
    text?: Record<string, FountainAsset>;
  };
  properties?: ScreenplayProperties;
  diagnostics?: FountainDiagnostic[];
}
