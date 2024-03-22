import { SparkTokenTag } from "../types/SparkTokenTag";

const DISPLAY_TOKEN_TYPES: readonly SparkTokenTag[] = [
  "transition",
  "scene",
  "dialogue_box",
  "action_box",
] as const;

export default DISPLAY_TOKEN_TYPES;
