import { FountainAsset } from "../../../impower-script-parser";

export const getFountainAsset = (
  type: "image" | "audio" | "video" | "text",
  name: string,
  sectionId: string,
  assets: {
    image?: Record<string, FountainAsset>;
    video?: Record<string, FountainAsset>;
    audio?: Record<string, FountainAsset>;
    text?: Record<string, FountainAsset>;
  }
): FountainAsset => {
  return (
    assets?.[type]?.[`${sectionId}.${name}`] || assets?.[type]?.[`.${name}`]
  );
};
