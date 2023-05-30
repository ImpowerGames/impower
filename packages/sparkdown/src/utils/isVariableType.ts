import { variableTypes } from "../constants/variableTypes";
import { SparkVariableType } from "../types/SparkVariableType";

export const isVariableType = (type: string): type is SparkVariableType => {
  return variableTypes.includes(type as SparkVariableType);
};
