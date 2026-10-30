import { type Reference } from "../../../core/types/Reference";

export type MorphBlend = "morph" | "fade" | "cut" | "scale";
export type MorphFallback = "fade" | "cut" | "scale";
export type MorphMethod = "match" | "bend" | "trace";

export interface MorphPolicy {
  blend?: MorphBlend;
  method?: MorphMethod;
  fallback?: MorphFallback;
}

export interface MorphTiming {
  duration: number;
  delay: number;
  easing: string;
  iterations: number | "infinite";
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  iteration_delay_min?: number;
  iteration_delay_max?: number;
}

export interface MorphPose {
  state?: string;
  translate?: string | number;
  rotate?: string | number;
  scale?: string | number;
  transform?: string;
  transform_origin?: string | number;
  opacity?: number | string;
}

export interface MorphKeyframe {
  offset?: number;
  [container: string]: MorphPose | number | undefined;
}

export interface MorphClip {
  between: string[];
  targets: string[];
}

export interface Morph extends Reference<"morph">, MorphPolicy {
  layers: Record<string, MorphPolicy>;
  keyframes: MorphKeyframe[];
  timing: MorphTiming;
  clips: MorphClip[];
}
