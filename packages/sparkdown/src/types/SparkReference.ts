import { Range } from "./SparkDiagnostic";

export interface SparkReference {
  fuzzy?: boolean;
  description: string;
  selectors: string[];
  range: Range;
}
