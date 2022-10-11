import { SparkEntity } from "../types/SparkEntity";
import { isEntityType } from "./isEntityType";

export const isEntity = (obj: unknown): obj is SparkEntity => {
  return isEntityType((obj as SparkEntity)?.type);
};
