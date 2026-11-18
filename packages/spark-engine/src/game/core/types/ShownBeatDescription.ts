import type { BeatKind } from "./Instructions";

export interface ShownBeatWrite {
  target: string;
  value: string;
}

export interface ShownBeatDescription {
  kind: BeatKind | null;
  speaker?: string;
  words: string;
  options?: string[];
  write?: ShownBeatWrite;
}
