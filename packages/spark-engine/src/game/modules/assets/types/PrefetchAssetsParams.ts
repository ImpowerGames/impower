import { type AssetItem } from "./AssetItem";

/** Load these in the background, unpinned; the cache size decides how long
 *  they stay. */
export interface PrefetchAssetsParams {
  items: AssetItem[];
  /** 2 = the prediction window, 3 = its spill into other scenes. */
  priority: 2 | 3;
}
