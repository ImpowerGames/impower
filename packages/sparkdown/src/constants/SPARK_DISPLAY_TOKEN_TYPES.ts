import { SparkTokenType } from "../types/SparkTokenType";

export const SPARK_DISPLAY_TOKEN_TYPES: readonly SparkTokenType[] = [
  "dialogue",
  "action",
  "centered",
  "transition",
  "scene",
  "assets",
  "action_asset",
  "dialogue_asset",
] as const;