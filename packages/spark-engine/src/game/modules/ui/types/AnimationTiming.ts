export interface AnimationTiming {
  delay?: number | string;
  duration?: number | string;
  easing?: string;
  iterations?: number | "infinite";
  direction?: "alternate" | "alternate-reverse" | "normal" | "reverse";
  fill?: "auto" | "backwards" | "both" | "forwards" | "none";
}
