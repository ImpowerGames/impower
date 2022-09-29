import { displayTokenTypes } from "../constants/displayTokenTypes";
import { SparkDisplayToken } from "../types/SparkToken";

export const isSparkDisplayToken = (obj: unknown): obj is SparkDisplayToken => {
  if (!obj) {
    return false;
  }
  const cast = obj as SparkDisplayToken;
  return displayTokenTypes.includes(cast.type);
};
