import type { BeatKind } from "./Instructions";

export interface ShownBeatDescription {
  kind: BeatKind | null;
  speaker?: string;
  words: string;
  options?: string[];
}
