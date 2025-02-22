/// This is used by `Tree.build` as an abstraction for iterating over
/// a tree buffer. A cursor initially points at the very last element
/// in the buffer. Every time `next()` is called it moves on to the
/// previous one.
export interface IBufferCursor {
  /// The current buffer position (four times the number of nodes
  /// remaining).
  pos: number;
  /// The node ID of the next node in the buffer.
  id: number;
  /// The start position of the next node in the buffer.
  start: number;
  /// The end position of the next node.
  end: number;
  /// The size of the next node (the number of nodes inside, counting
  /// the node itself, times 4).
  size: number;
  /// Moves `this.pos` down by 4.
  next(): void;
  /// Create a copy of this cursor.
  fork(): IBufferCursor;
}
