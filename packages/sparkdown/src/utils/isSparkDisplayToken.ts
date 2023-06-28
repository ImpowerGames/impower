import { SPARK_DISPLAY_TOKEN_TYPES } from "../constants/SPARK_DISPLAY_TOKEN_TYPES";
import { SparkDisplayToken } from "../types/SparkToken";
import { SparkTokenType } from "../types/SparkTokenType";

export const isSparkDisplayToken = (obj: unknown): obj is SparkDisplayToken => {
  if (!obj) {
    return false;
  }
  const cast = obj as SparkDisplayToken;
  return SPARK_DISPLAY_TOKEN_TYPES.includes(cast.type as SparkTokenType);
};
