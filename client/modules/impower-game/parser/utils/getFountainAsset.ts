import { FountainAsset } from "../../../impower-script-parser";

export const getFountainAsset = (
  name: string,
  sectionId: string,
  assets: Record<string, FountainAsset>
): FountainAsset => {
  return assets?.[`${sectionId}.${name}`] || assets?.[`.${name}`];
};
