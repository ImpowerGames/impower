import { SparkVariableType } from "../types/SparkVariableType";
import { assetTypes } from "./assetTypes";
import { primitiveTypes } from "./primitiveTypes";

export const variableTypes: SparkVariableType[] = [
  ...primitiveTypes,
  ...assetTypes,
  "tag",
];
