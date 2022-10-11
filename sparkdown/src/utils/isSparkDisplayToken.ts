import { displayTokenTypes } from "../constants/displayTokenTypes";
import { SparkDisplayToken } from "../types/SparkToken";
import { SparkTokenType } from "../types/SparkTokenType";

export const isSparkDisplayToken = (obj: unknown): obj is SparkDisplayToken => {
  if (!obj) {
    return false;
  }
  const cast = obj as SparkDisplayToken;
  return displayTokenTypes.includes(cast.type as SparkTokenType);
};
