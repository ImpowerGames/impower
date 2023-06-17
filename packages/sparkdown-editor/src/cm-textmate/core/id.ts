export enum NodeID {
  /** ID for the `NodeType.none` node. */
  NONE,
  /** ID for the top-level node. */
  TOP,
  /** ID for the newline node. */
  NEWLINE,
  /**
   * ID for the `ERROR_UNRECOGNIZED` node.
   *
   * @see {@link NODE_ERROR_UNRECOGNIZED}
   */
  ERROR_UNRECOGNIZED,
  /**
   * ID for the `ERROR_INCOMPLETE` node.
   *
   * @see {@link NODE_ERROR_INCOMPLETE}
   */
  ERROR_INCOMPLETE,
  /** First ID available for the grammar. */
  SAFE,
}
