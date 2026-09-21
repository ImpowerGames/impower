/** The lines of one script that a stretch of execution covered. */
export interface ExecutedLines {
  /** Inclusive line ranges, sorted, with overlapping and adjacent ranges
   *  merged, flattened as `[start, end, start, end, ...]`. */
  ranges: number[];
  /** The line the script's last executed location ends on. */
  last: number;
}
