export interface ITreeBuffer {
  /**
   * The buffer's content.
   */
  readonly buffer: Uint16Array;
  /**
   * The total length of the group of nodes in the buffer.
   */
  readonly length: number;
}
