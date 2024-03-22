import DISPLAY_TOKEN_TYPES from "../constants/SPARK_DISPLAY_TOKEN_TYPES";
import { ISparkDisplayToken } from "../types/SparkToken";
import { SparkTokenTag } from "../types/SparkTokenTag";

const isSparkDisplayToken = (obj: unknown): obj is ISparkDisplayToken => {
  if (!obj) {
    return false;
  }
  const cast = obj as ISparkDisplayToken;
  return DISPLAY_TOKEN_TYPES.includes(cast.tag as SparkTokenTag);
};

export default isSparkDisplayToken;
