import { FountainVariableType } from "./FountainVariableType";

export interface FountainVariable {
  from: number;
  to: number;
  line: number;
  name: string;
  type: FountainVariableType;
  value: string | number | boolean;
  parameter: boolean;
  scope: "public" | "protected" | "private";
}
