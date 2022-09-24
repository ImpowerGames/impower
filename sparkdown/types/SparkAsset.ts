import { SparkAssetType } from "./SparkAssetType";

export interface SparkAsset {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkAssetType;
  value: string;
}
