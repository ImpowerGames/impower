import { SparkBlockType } from "../constants/SPARK_REGEX";

export const getBlockType = (match: string[] | null): SparkBlockType | null => {
  const blockType = match?.[0];
  return blockType as SparkBlockType;
};
