import type { Range } from "./SparkDiagnostic";

export interface SparkLocation {
  uri: string;
  range: Range;
  text?: string;
}
