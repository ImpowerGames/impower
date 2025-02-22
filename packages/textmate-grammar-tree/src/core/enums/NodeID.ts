export enum NodeID {
  /** ID for the `NodeType.none` node. */
  none,
  /** ID for the top-level node. */
  top,
  /**
   * ID for the `ERROR_UNRECOGNIZED` node.
   *
   * @see {@link NODE_ERROR_UNRECOGNIZED}
   */
  unrecognized,
  /**
   * ID for the `ERROR_INCOMPLETE` node.
   *
   * @see {@link NODE_ERROR_INCOMPLETE}
   */
  incomplete,
  /** First ID available for the grammar. */
  safe,
}
