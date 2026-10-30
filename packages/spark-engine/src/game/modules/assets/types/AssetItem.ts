import { type LoadAudioPlayerParams } from "../../audio/types/LoadAudioPlayerParams";

export type AssetPriority = 0 | 1 | 2 | 3;

export interface ImageAssetItem {
  kind: "image";
  src: string;
}

export interface FontAssetItem {
  kind: "font";
  src: string;
  family: string;
  weight?: string;
  style?: string;
  stretch?: string;
  display?: string;
  unicodeRange?: string;
}

export interface AudioAssetItem {
  kind: "audio";
  params: LoadAudioPlayerParams;
}

export interface VideoAssetItem {
  kind: "video";
  src: string;
}

export type AssetItem =
  | ImageAssetItem
  | FontAssetItem
  | AudioAssetItem
  | VideoAssetItem;

export const assetItemKey = (item: AssetItem): string => {
  switch (item.kind) {
    case "audio":
      return item.params.key;
    case "font":
      return `font:${item.family}|${item.weight ?? ""}|${item.style ?? ""}|${item.stretch ?? ""}|${item.unicodeRange ?? ""}|${item.src}`;
    default:
      return item.src;
  }
};
