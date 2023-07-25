import { SparkVariableType } from "../types/SparkVariableType";
import { SPARK_PRIMITIVE_TYPES } from "./SPARK_PRIMITIVE_TYPES";

export const SPARK_VARIABLE_TYPES: readonly SparkVariableType[] = [
  ...SPARK_PRIMITIVE_TYPES,
  "object",
] as const;
