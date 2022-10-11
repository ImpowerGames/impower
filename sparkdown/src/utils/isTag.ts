import { SparkTag } from "../types/SparkTag";
import { isTagType } from "./isTagType";

export const isTag = (obj: unknown): obj is SparkTag => {
  return isTagType((obj as SparkTag)?.type);
};
