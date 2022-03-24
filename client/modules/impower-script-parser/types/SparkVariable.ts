import { SparkVariableType } from "./SparkVariableType";

export interface SparkVariable {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkVariableType;
  value: unknown;
  parameter: boolean;
  scope: "public" | "protected" | "private";
}
