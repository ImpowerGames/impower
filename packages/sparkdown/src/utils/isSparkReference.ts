import { SparkReference } from "../types/SparkReference";

const isSparkReference = (obj: unknown): obj is SparkReference => {
  if (!obj) {
    return false;
  }
  const cast = obj as SparkReference;
  return Boolean(cast.name);
};

export default isSparkReference;
