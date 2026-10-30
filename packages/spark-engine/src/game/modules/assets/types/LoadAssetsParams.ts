import { type AssetItem } from "./AssetItem";

export interface LoadAssetsParams {
  items: AssetItem[];
  priority: 0 | 1;
  pin: string;
  pinBudget?: number;
}
