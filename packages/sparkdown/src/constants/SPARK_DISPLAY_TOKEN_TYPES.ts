import { SparkTokenTag } from "../types/SparkTokenTag";

const SPARK_DISPLAY_TOKEN_TYPES: readonly SparkTokenTag[] = [
  "transition",
  "scene",
  "dialogue_box",
  "action_box",
] as const;

export default SPARK_DISPLAY_TOKEN_TYPES;
