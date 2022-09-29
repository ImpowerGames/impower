export interface DynamicBodiesTreeConfig {
  /**
   * The maximum number of items per node on the RTree.
   *
   * This is ignored if useTree is false.
   * If you have a large number of bodies in your world then you may find
   * search performance improves by increasing this value,
   * to allow more items per node and less node division.
   */
  maxEntries: number;
}
