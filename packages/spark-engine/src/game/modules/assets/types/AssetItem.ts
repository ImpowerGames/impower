import { type LoadAudioPlayerParams } from "../../audio/types/LoadAudioPlayerParams";

/**
 * Request priorities, best first. 0 is the express lane (a line's gate, the
 * restore gate, a layout mount, and the page's hint for the beats under the
 * editor's cursor); 1 an explicit load's set; 2 the prediction window, in
 * play and in preview; 3 the window's spill into loaded and successor
 * scenes and, in preview, the rest of the current scene.
 */
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

/** One thing the page can make resident. Structured-cloneable, so it crosses
 *  a worker boundary unchanged. */
export type AssetItem =
  | ImageAssetItem
  | FontAssetItem
  | AudioAssetItem
  | VideoAssetItem;

/**
 * The identity the page caches an item under and reports back in load
 * results. Images and video are their src; audio is its player key (the
 * asset name plus any tone suffix); a font is the face it adds to
 * `document.fonts`, which is how the page tells an already-present face from
 * a new one.
 */
export const assetItemKey = (item: AssetItem): string => {
  switch (item.kind) {
    case "audio":
      return item.params.key;
    case "font":
      // A face is its descriptors AND its file: two subsets of one family
      // (different `unicode_range`, different `src`) are two faces.
      return `font:${item.family}|${item.weight ?? ""}|${item.style ?? ""}|${item.stretch ?? ""}|${item.unicodeRange ?? ""}|${item.src}`;
    default:
      return item.src;
  }
};
