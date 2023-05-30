import { tagTypes } from "../constants/tagTypes";
import { SparkTagType } from "../types/SparkTagType";

export const isTagType = (type: string): type is SparkTagType => {
  return tagTypes.includes(type as SparkTagType);
};
