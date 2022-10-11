import { SparkAsset } from "../types/SparkAsset";
import { isAssetType } from "./isAssetType";

export const isAsset = (obj: unknown): obj is SparkAsset => {
  return isAssetType((obj as SparkAsset)?.type);
};
