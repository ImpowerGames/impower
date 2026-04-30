import { type Reference } from "../../../core/types/Reference";
import { type AnimationTiming } from "./AnimationTiming";

export interface Animation extends Reference<"animation"> {
  target: Reference<"layer">;
  keyframes: any[];
  timing: AnimationTiming;
}
