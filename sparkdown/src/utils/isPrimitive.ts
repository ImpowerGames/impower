import { SparkPrimitive } from "../types/SparkPrimitive";
import { isPrimitiveType } from "./isPrimitiveType";

export const isPrimitive = (obj: unknown): obj is SparkPrimitive => {
  return isPrimitiveType((obj as SparkPrimitive)?.type);
};
