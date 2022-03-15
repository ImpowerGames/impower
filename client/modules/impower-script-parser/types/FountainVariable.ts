import { FountainVariableType } from "./FountainVariableType";

export interface FountainVariable {
  start: number;
  line: number;
  name: string;
  type: FountainVariableType;
  value: string | number;
  valueText: string;
}
