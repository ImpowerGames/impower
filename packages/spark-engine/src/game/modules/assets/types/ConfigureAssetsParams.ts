export interface ConfigureAssetsParams {
  /** Bytes prediction may keep resident: the pool of unpinned entries (what
   *  is displayed, playing, or pinned does not count), evicted least recently
   *  used first once it is exceeded. 0 means never evict. */
  predictBytes: number;
  /** Bytes the `load:` pins may hold between them. A load pins in order
   *  until it is reached; the rest stays resident but unpinned. 0 means no
   *  cap. */
  loadBytes: number;
}
