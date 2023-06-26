import { SparkRange } from "./SparkRange";
import { SparkVariable } from "./SparkVariable";

export interface SparkLine extends SparkRange {
  type: string;
  content: string;
  text: string;
  notes?: Partial<SparkVariable>[];

  line: number;
  from: number;
  to: number;
  offset: number;
  indent: number;

  order: number;
  ignore?: boolean;
  skipToNextPreview?: boolean;

  html?: string;
  duration?: number;
}
