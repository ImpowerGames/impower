import { SparkVariable } from "../types/SparkVariable";
import { isVariableType } from "./isVariableType";

export const isVariable = (obj: unknown): obj is SparkVariable => {
  return isVariableType((obj as SparkVariable)?.type);
};
