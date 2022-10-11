import { entityTypes } from "../constants/entityTypes";
import { SparkEntityType } from "../types/SparkEntityType";

export const isEntityType = (type: string): type is SparkEntityType => {
  return entityTypes.includes(type as SparkEntityType);
};
