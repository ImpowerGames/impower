import { SparkScopeType } from "../types/SparkScopeType";

const SPARK_SCOPE_TYPES: readonly SparkScopeType[] = [
  "front-matter",
  "dialogue",
  "string",
  "struct",
  "type",
] as const;

export default SPARK_SCOPE_TYPES;
