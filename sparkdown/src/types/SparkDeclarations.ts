import { SparkEntity } from "./SparkEntity";
import { SparkVariable } from "./SparkVariable";

export interface SparkDeclarations {
  variables?: Record<string, SparkVariable>;
  entities?: Record<string, SparkEntity>;
}
