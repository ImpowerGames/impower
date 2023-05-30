import { primitiveTypes } from "../constants/primitiveTypes";
import { SparkPrimitiveType } from "../types/SparkPrimitiveType";

export const isPrimitiveType = (type: string): type is SparkPrimitiveType => {
  return primitiveTypes.includes(type as SparkPrimitiveType);
};
