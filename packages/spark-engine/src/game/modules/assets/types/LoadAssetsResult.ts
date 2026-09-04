/** Every requested item settles into `loaded` or `failed` (keys per
 *  `assetItemKey`); `pinned` lists the loaded items the page kept under the
 *  request's pin, which stops short of the whole set when the pin budget ran
 *  out. */
export interface LoadAssetsResult {
  loaded: string[];
  failed: string[];
  pinned: string[];
}
