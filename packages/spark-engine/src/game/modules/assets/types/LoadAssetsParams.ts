import { type AssetItem } from "./AssetItem";

export interface LoadAssetsParams {
  items: AssetItem[];
  /** 0 = express lane (gates), 1 = an explicit load's set. */
  priority: 0 | 1;
  /** Kept resident under this pin until it is released. */
  pin: string;
  /** Bytes the page may pin for this request. Absent means the page's own
   *  cache size applies. Items are pinned in order until it is reached. */
  pinBudget?: number;
}
