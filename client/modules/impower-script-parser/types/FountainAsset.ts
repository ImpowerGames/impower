import { FountainAssetType } from "./FountainAssetType";

export interface FountainAsset {
  start: number;
  line: number;
  name: string;
  type: FountainAssetType;
  value: string;
  valueText: string;
}
