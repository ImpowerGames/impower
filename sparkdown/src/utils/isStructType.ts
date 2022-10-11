import { structTypes } from "../constants/structTypes";
import { SparkStructType } from "../types/SparkStructType";

export const isStructType = (type: string): type is SparkStructType => {
  return structTypes.includes(type as SparkStructType);
};
