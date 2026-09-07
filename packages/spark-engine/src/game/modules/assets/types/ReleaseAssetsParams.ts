export interface ReleaseAssetsParams {
  pins: string[];
  /** Evict now whatever these pins leave unpinned, unless it is still
   *  displayed, playing, or held by another pin. Without it the entries stay
   *  until the cache size needs the room. */
  drop: boolean;
}
