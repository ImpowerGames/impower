/** The lines of one script that a stretch of execution covered. */
export interface ExecutedLines {
  /** Inclusive line ranges, sorted, with adjacent lines joined, flattened as
   *  `[start, end, start, end, ...]`. */
  ranges: number[];
  /** The last line to join the script's executed lines, taking each
   *  location's lines in execution order. */
  last: number;
}
