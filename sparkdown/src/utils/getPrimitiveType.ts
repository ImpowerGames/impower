import { SparkPrimitiveType } from "../types/SparkPrimitiveType";
import { SparkVariableType } from "../types/SparkVariableType";
import { isAssetType } from "./isAssetType";
import { isTagType } from "./isTagType";

export const getPrimitiveType = (
  type: SparkVariableType
): SparkPrimitiveType => {
  if (isAssetType(type)) {
    return "string";
  }
  if (isTagType(type)) {
    return "string";
  }
  return type;
};
