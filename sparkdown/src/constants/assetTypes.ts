import { SparkAssetType } from "../types/SparkAssetType";

export const assetTypes: readonly SparkAssetType[] = [
  "image",
  "audio",
  "video",
  "text",
  "graphic",
] as const;
