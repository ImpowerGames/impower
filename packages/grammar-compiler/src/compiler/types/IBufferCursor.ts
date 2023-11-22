/**
 * A cursor initially points at the very last node in the buffer.
 * Every time `next()` is called it moves on to the previous node.
 */
export interface IBufferCursor {
  /**
   * The current buffer position (four times the number of nodes remaining).
   */
  pos: number;
  /**
   * The node ID.
   */
  id: number;
  /**
   * The start position of the node.
   */
  start: number;
  /**
   * The end position of the node.
   */
  end: number;
  /**
   * The size of the node (the number of nodes inside this node, counting the node itself, times 4).
   */
  size: number;
  /**
   * Move to the next node (increments this.pos by 4).
   */
  next(): void;
  /**
   * Create a copy of this cursor.
   */
  fork(): IBufferCursor;
}
