import { SPARK_VARIABLE_TYPES } from "../constants/SPARK_VARIABLE_TYPES";
import { SparkVariableType } from "../types/SparkVariableType";

export const isVariableType = (type: string): type is SparkVariableType => {
  return SPARK_VARIABLE_TYPES.includes(type as SparkVariableType);
};
