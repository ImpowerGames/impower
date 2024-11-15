import { Range } from "./SparkDiagnostic";

export interface SparkReference {
  range?: Range;

  descriptionType?: string;

  selectorTypes?: string[];
  selectorName?: string;
  fuzzySelect?: boolean;

  structType?: string;
  structName?: string;
  structProperty?: string;
}
