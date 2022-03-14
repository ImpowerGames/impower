import { FountainAssetType } from "./FountainAssetType";

export interface FountainAsset {
  start: number;
  line: number;
  type: FountainAssetType;
  value: string;
}
