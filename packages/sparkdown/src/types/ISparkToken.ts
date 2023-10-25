import { SparkRange } from "./SparkRange";

export interface ISparkToken extends SparkRange {
  tag: string;

  print?: string;

  line: number;
  from: number;
  to: number;

  indent: number;
  order: number;

  ignore?: boolean;

  html?: string;
  duration?: number;
}
