import { SparkVariableType } from "../types/SparkVariableType";
import { primitiveTypes } from "./primitiveTypes";

export const variableTypes: readonly SparkVariableType[] = [
  ...primitiveTypes,
] as const;
