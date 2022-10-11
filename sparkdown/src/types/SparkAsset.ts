import { SparkAssetType } from "./SparkAssetType";
import { SparkVariable } from "./SparkVariable";

export interface SparkAsset extends SparkVariable {
  type: SparkAssetType;
  value: string;
}
