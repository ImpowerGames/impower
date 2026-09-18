import { type Reference } from "../../../core/types/Reference";

export type MorphBlend = "morph" | "fade" | "cut" | "scale";
export type MorphFallback = "fade" | "cut" | "scale";
export type MorphMethod = "match" | "bend" | "trace";

/** How shapes change between poses, at the root or for one layer label. */
export interface MorphPolicy {
  blend?: MorphBlend;
  method?: MorphMethod;
  fallback?: MorphFallback;
}

export interface MorphTiming {
  /** Seconds one play lasts. */
  duration: number;
  /** Seconds before the first play. */
  delay: number;
  /** A CSS timing function applied once over a whole play. */
  easing: string;
  /** Plays, or `infinite`. `0` disables playback. */
  iterations: number | "infinite";
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  /** Shortest quiet time between plays, in seconds. Paired with the max. */
  iteration_delay_min?: number;
  /** Longest quiet time between plays, in seconds. Paired with the min. */
  iteration_delay_max?: number;
}

/** One group's or layer's pose at a keyframe. */
export interface MorphPose {
  /** The attribute state the group shows, without its group prefix. */
  state?: string;
  translate?: string | number;
  rotate?: string | number;
  scale?: string | number;
  transform?: string;
  transform_origin?: string | number;
  opacity?: number | string;
}

export interface MorphKeyframe {
  /** 0 to 1; omitted offsets are spaced as for `animation` keyframes. */
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
