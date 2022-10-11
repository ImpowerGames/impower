import { SparkPrimitiveType } from "./SparkPrimitiveType";
import { SparkVariable } from "./SparkVariable";

export interface SparkPrimitive extends SparkVariable {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkPrimitiveType;
  value: unknown;
  parameter?: boolean;
  scope?: "public" | "protected" | "private";
}
