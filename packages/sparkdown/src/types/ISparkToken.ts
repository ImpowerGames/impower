import { SparkRange } from "./SparkRange";

export interface ISparkToken extends SparkRange {
  tag: string;

  print?: string;
  content?: ISparkToken[];

  line: number;
  from: number;
  to: number;

  nested: number;
  order: number;

  ignore?: boolean;

  html?: string;
  duration?: number;
}
