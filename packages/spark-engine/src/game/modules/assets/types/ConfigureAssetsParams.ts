export interface ConfigureAssetsParams {
  /** Bytes of resident assets to keep before evicting the least recently used
   *  unpinned ones. 0 means never evict. */
  cacheBytes: number;
}
