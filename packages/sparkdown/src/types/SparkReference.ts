import { Range } from "./SparkDiagnostic";
import { SparkSelector } from "./SparkSelector";
import { SparkDeclaration } from "./SparkDeclaration";

export interface SparkReference {
  range: Range;
  selector?: SparkSelector;
  resolved?: string;
  declaration?: SparkDeclaration;
}
