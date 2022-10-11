import { assetTypes } from "../constants/assetTypes";
import { SparkAssetType } from "../types/SparkAssetType";

export const isAssetType = (type: string): type is SparkAssetType => {
  return assetTypes.includes(type as SparkAssetType);
};
