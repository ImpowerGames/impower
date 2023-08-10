import { SparkTokenType } from "../types/SparkTokenType";

const SPARK_FLOW_TOKEN_TYPES: readonly SparkTokenType[] = [
  "jump",
  "choice",
] as const;

export default SPARK_FLOW_TOKEN_TYPES;
