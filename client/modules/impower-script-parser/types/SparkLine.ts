import { SparkAsset } from "./SparkAsset";
import { SparkTokenType } from "./SparkTokenType";

export interface SparkLine {
  type: SparkTokenType;
  content?: string;
  text?: string;
  notes?: Partial<SparkAsset>[];

  line?: number;
  from?: number;
  to?: number;
  offset?: number;
  indent?: number;
  wait?: "input" | number | boolean;

  order?: number;
  ignore?: boolean;

  html?: string;
}
