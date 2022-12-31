import { SparkVariableType } from "../types/SparkVariableType";
import { assetTypes } from "./assetTypes";
import { primitiveTypes } from "./primitiveTypes";

export const variableTypes: readonly SparkVariableType[] = [
  ...primitiveTypes,
  ...assetTypes,
  "tag",
] as const;
