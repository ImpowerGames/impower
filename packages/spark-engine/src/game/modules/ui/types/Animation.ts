import { Reference } from "../../../core/types/Reference";
import { AnimationTiming } from "./AnimationTiming";

export interface Animation extends Reference<"animation"> {
  keyframes: Record<string, string | number | undefined>[];
  timing: AnimationTiming;
}
