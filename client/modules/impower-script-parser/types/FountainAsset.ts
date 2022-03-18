import { FountainAssetType } from "./FountainAssetType";

export interface FountainAsset {
  from: number;
  to: number;
  line: number;
  name: string;
  type: FountainAssetType;
  value: string;
  valueText: string;
}
