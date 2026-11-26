import { escapeCssIdentifier } from "./themeVariableName.js";

export interface AnimationShorthandTiming {
  delay?: number | string;
  duration?: number | string;
  easing?: string;
  iterations?: number | string;
  direction?: string;
  fill?: string;
}

export const DEFAULT_ANIMATION_TIMING = {
  delay: 0,
  duration: 0,
  easing: "ease",
  iterations: 1,
  fill: "both",
  direction: "normal",
} as const;

export interface TimingFunction {
  function: string;
  parameters: (string | number)[];
}

export const getTimingFunction = (ease: TimingFunction): string =>
  `${ease.function}(${ease.parameters.join(",")})`;

const time = (value: number | string | undefined): string =>
  typeof value === "number" || (typeof value === "string" && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value))
    ? `${value}s`
    : value || "0s";

export const getAnimationShorthand = (
  name: string,
  timing: AnimationShorthandTiming | undefined,
  resolveEase?: (easing: string) => string | undefined,
): string => {
  const easing = timing?.easing || DEFAULT_ANIMATION_TIMING.easing;
  const iterations = timing?.iterations;
  const fill = timing?.fill || DEFAULT_ANIMATION_TIMING.fill;
  return [
    time(timing?.duration),
    resolveEase?.(easing) || easing,
    time(timing?.delay),
    iterations === Infinity ? "infinite" : String(iterations ?? "") || String(DEFAULT_ANIMATION_TIMING.iterations),
    timing?.direction || DEFAULT_ANIMATION_TIMING.direction,
    fill === "auto" ? "none" : fill,
    "running",
    escapeCssIdentifier(name),
  ].join(" ");
};
