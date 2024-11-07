import { Range } from "./SparkDiagnostic";

export interface SparkReference {
  range?: Range;
  description?: string;
  types?: string[];
  selectors?: string[];
  fuzzy?: boolean;
}
