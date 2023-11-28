export interface Asset {
  type: string;
  name: string;
  src: string;
}

export const isAsset = (obj: unknown): obj is Asset => {
  const asset = obj as Asset;
  return asset && Boolean(asset.type && asset.name && asset.src);
};

export const isAssetOfType = <T extends string>(
  value: unknown,
  type: T
): value is Asset & { type: T } => {
  return isAsset(value) && value.type === type;
};
