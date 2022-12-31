import { SparkTokenType } from "../types/SparkTokenType";

export const displayTokenTypes: readonly SparkTokenType[] = [
  "dialogue",
  "action",
  "centered",
  "transition",
  "scene",
  "assets",
  "action_asset",
  "dialogue_asset",
] as const;
