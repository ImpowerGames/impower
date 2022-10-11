import { SparkVariable } from "./SparkVariable";

export interface SparkTag extends SparkVariable {
  type: "tag";
  value: string;
}
