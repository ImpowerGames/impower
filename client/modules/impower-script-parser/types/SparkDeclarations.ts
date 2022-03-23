import { SparkAsset } from "./SparkAsset";
import { SparkEntity } from "./SparkEntity";
import { SparkTag } from "./SparkTag";
import { SparkVariable } from "./SparkVariable";

export interface SparkDeclarations {
  variables?: Record<string, SparkVariable>;
  entities?: Record<string, SparkEntity>;
  tags?: Record<string, SparkTag>;
  assets?: Record<string, SparkAsset>;
}
