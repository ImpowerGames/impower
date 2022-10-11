import { SparkAssetType } from "./SparkAssetType";
import { SparkPrimitiveType } from "./SparkPrimitiveType";

export type SparkVariableType = SparkPrimitiveType | SparkAssetType | "tag";
