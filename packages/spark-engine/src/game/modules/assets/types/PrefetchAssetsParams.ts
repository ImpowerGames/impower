import { type AssetItem } from "./AssetItem";

export interface PrefetchAssetsParams {
  items: AssetItem[];
  priority: 2 | 3;
}
