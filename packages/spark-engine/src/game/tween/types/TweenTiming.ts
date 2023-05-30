export interface TweenTiming {
  delay?: number;
  duration?: number;
  ease?: (p: number) => number;
  on?: (
    interpolate: (
      a: number,
      b: number,
      p?: number,
      e?: (p: number) => number
    ) => number,
    p: number
  ) => void;
}
