import { AnimationTiming } from "./AnimationTiming";

export interface Animation {
  keyframes: Record<string, string | number>[];
  timing: AnimationTiming;
}
