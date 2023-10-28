import { SparkRange } from "./SparkRange";

export interface ISparkToken<T extends string> extends SparkRange {
  tag: T;

  print?: string;

  line: number;
  from: number;
  to: number;

  indent: number;
  order: number;

  ignore?: boolean;

  html?: string;
  duration?: number;

  ranges?: Record<string, SparkRange>;
}