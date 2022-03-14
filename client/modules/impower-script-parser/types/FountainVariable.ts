import { FountainVariableType } from "./FountainVariableType";

export interface FountainVariable {
  start: number;
  line: number;
  type: FountainVariableType;
  value: string | number;
}
