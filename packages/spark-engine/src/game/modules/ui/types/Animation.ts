import { Reference } from "../../../core/types/Reference";
import { AnimationTiming } from "./AnimationTiming";

export interface Animation extends Reference<"animation"> {
  target: Reference<"layer">;
  keyframes: any[];
  timing: AnimationTiming;
}
