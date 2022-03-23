import { SparkVariableType } from "./SparkVariableType";

export interface SparkVariable {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkVariableType;
  value: string | number | boolean;
  parameter: boolean;
  scope: "public" | "protected" | "private";
}
