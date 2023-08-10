import { SparkBlockType } from "../constants/SPARK_REGEX";

const getBlockType = (match: string[] | null): SparkBlockType | null => {
  const blockType = match?.[0];
  return blockType as SparkBlockType;
};

export default getBlockType;
