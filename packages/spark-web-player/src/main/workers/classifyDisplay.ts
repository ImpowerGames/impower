import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";

/**
 * The display the page shows, as the worker recorded it once the display
 * went up (#657): the game that displayed it and whether its program was a
 * suggestion's. Gone while a display is under way, when one is taken over,
 * and when PLAY takes the page.
 */
export interface StandingDisplay {
  game: unknown;
  speculative: boolean;
}

/**
 * Whether the worker lets the next display be beat-only (#657): `true`, or
 * the reason it does not. It does when the page shows a display of this
 * game that went up whole (not `fresh`, not taken over, no PLAY since:
 * `unshown`), of the same kind of program (a suggestion after a suggestion,
 * or the real program after the real program: `swap`), and the route reached
 * the point (`checkpoint`). The game then decides what only it knows,
 * whether the state before the beat is the one that display ran it from
 * among them (`Game.beatOnlyRefusal`).
 */
export function workerBeatOnly(
  standing: StandingDisplay | undefined,
  display: {
    game: unknown;
    fresh: boolean;
    speculative: boolean;
    checkpoint: string | StoredCheckpoint | undefined;
  },
): true | string {
  if (display.fresh) {
    return "fresh";
  }
  if (!standing || standing.game !== display.game) {
    return "unshown";
  }
  if (standing.speculative !== display.speculative) {
    return "swap";
  }
  if (!display.checkpoint) {
    return "checkpoint";
  }
  return true;
}
