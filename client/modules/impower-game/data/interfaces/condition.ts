import { CompareOperator } from "../enums/compareOperator";
import { DynamicData } from "./generics/dynamicData";
import { VariableReference } from "./references/variableReference";

export interface Condition {
  variable: VariableReference;
  operator: CompareOperator;
  value: DynamicData;
}
