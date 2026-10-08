export interface GameConfiguration {
  restarted?: boolean;
  /** The game's own version string, which a save of a game on the program
   *  engine names in its header (docs/engine/binary-program.md, section 7).
   *  Empty when unset. */
  version?: string;
  /** How many of the beats the player passed a save on the program engine
   *  holds, so that a load into an updated game can fall back to a beat
   *  whose position the new program still has (docs/engine/binary-program.md,
   *  section 7). Default 16. */
  saveHistory?: number;
  /** How many beats the program engine keeps restorable during play, which
   *  a rewind reads; a save holds the last `saveHistory` of them. Default
   *  128. */
  rewindBeats?: number;
  /** How many times one uninterrupted stretch of execution may advance the
   *  story before it is stopped as a runaway (see `Game.step`). Counted in work
   *  rather than elapsed time, so a long scene is not mistaken for an infinite
   *  loop on a slow machine. Default 2,000,000. */
  executionStepLimit?: number;
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
