import { Range } from "./SparkDiagnostic";

export interface SparkReference {
  description: string;
  selectors: string[];
  range: Range;
}
