import type { BeatKind } from "../types/Instructions";

const BEAT_KIND_OF_TARGET: Readonly<Record<string, BeatKind>> = {
  action: "action",
  dialogue: "dialogue",
  title: "title",
  heading: "heading",
  transitional: "transition",
};

export const beatKindOfTarget = (target: string): BeatKind | undefined =>
  Object.hasOwn(BEAT_KIND_OF_TARGET, target) ? BEAT_KIND_OF_TARGET[target] : undefined;
