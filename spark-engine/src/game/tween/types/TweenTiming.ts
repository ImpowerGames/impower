export interface TweenTiming {
  loop?: boolean;
  delay?: number;
  duration?: number;
  callback?: (progress: number) => void;
}
