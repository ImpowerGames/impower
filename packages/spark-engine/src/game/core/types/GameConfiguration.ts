export interface GameConfiguration {
  restarted?: boolean;
  executionTimeout?: number;
  previewFrom?: { file: string; line: number } | null;
  startFrom?: { file: string; line: number } | null;
  breakpoints?: { file: string; line: number }[];
  functionBreakpoints?: { name: string }[];
  dataBreakpoints?: { dataId: string }[];
  /** Store per-beat checkpoints as periodic full keyframes + deltas instead of
   *  full saves (eliminates the O(n^2) cost of HMR route simulation). Default
   *  off — a settled-on kill switch. */
  incrementalCheckpoints?: boolean;
  /** When incremental checkpoints are on, assert every delta reconstructs
   *  byte-identically to a full save and fall back to a full keyframe on any
   *  mismatch. Default on (correctness guard). */
  verifyCheckpoints?: boolean;
  /** Beats between full keyframes in incremental mode. Default 50. */
  checkpointBaseInterval?: number;
}
