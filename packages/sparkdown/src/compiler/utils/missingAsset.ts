export const ADD_ASSET_COMMAND = "sparkdown.addAsset";

export const FILE_ASSET_TYPES = ["image", "audio", "video", "font"] as const;

export type FileAssetType = (typeof FILE_ASSET_TYPES)[number];

export interface MissingAsset {
  name: string;
  type: FileAssetType;
}

export interface MissingAssetData {
  missingAsset: MissingAsset;
}

export const isFileAssetType = (type: unknown): type is FileAssetType =>
  FILE_ASSET_TYPES.includes(type as FileAssetType);

export const missingAssetData = (
  name: string,
  type: string | undefined,
): MissingAssetData | undefined =>
  name && isFileAssetType(type) ? { missingAsset: { name, type } } : undefined;

export const missingAssetArgument = (value: unknown): MissingAsset | undefined => {
  const found = value as Partial<MissingAsset> | null | undefined;
  return typeof found?.name === "string" && found.name && isFileAssetType(found.type)
    ? { name: found.name, type: found.type }
    : undefined;
};

export const missingAssetOf = (data: unknown): MissingAsset | undefined =>
  missingAssetArgument(
    (data as Partial<MissingAssetData> | null | undefined)?.missingAsset,
  );
