import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";

export interface StandingDisplay {
  game: unknown;
  speculative: boolean;
}

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
