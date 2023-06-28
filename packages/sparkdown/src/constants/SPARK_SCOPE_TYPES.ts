import { SparkScopeType } from "../types/SparkScopeType";

export const SPARK_SCOPE_TYPES: readonly SparkScopeType[] = [
  "front-matter",
  "dialogue",
  "string",
  "struct",
  "type",
] as const;
