import { Range } from "./SparkDiagnostic";

export interface SparkReference {
  fuzzy?: boolean;
  description: string;
  types: string[];
  selectors: string[];
  range: Range;
}
