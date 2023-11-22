export interface Asset {
  type: string;
  name: string;
  src: string;
}

export const isAsset = (obj: unknown): obj is Asset => {
  const asset = obj as Asset;
  return asset && Boolean(asset.type && asset.name && asset.src);
};
