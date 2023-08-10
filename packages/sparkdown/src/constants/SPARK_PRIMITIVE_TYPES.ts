import { SparkPrimitiveType } from "../types/SparkPrimitiveType";

const SPARK_PRIMITIVE_TYPES: readonly SparkPrimitiveType[] = [
  "string",
  "number",
  "boolean",
] as const;

export default SPARK_PRIMITIVE_TYPES;
