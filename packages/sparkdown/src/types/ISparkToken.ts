import { SparkRange } from "./SparkRange";

export interface ISparkToken<T extends string = string> extends SparkRange {
  tag: T;

  indent: number;

  id: string;

  ignore?: boolean;

  html?: string;
  duration?: number;

  ranges?: Partial<Record<string, SparkRange>> & { checkpoint?: SparkRange };

  content?: ISparkToken<string>[];
}
