import { signal } from "@preact/signals";
import { patternEndings } from "../workspace/settings/fileEndings";

export type AssetType = "image" | "audio" | "video" | "text" | "font" | "other";

export type ConfiguredAssetType = "image" | "audio" | "video" | "font";

export type AssetEndings = Readonly<Record<ConfiguredAssetType, readonly string[]>>;

export interface AssetFilePatterns {
  imageFiles: string;
  audioFiles: string;
  videoFiles: string;
  fontFiles: string;
}

export interface AssetTypeSpec {
  type: AssetType;
  title: string;
  folder: string;
  unit: string;
}

export const ASSET_TYPES: readonly AssetTypeSpec[] = [
  { type: "image", title: "Images", folder: "Images", unit: "image" },
  { type: "audio", title: "Audio", folder: "Audio", unit: "sound" },
  { type: "video", title: "Video", folder: "Video", unit: "video" },
  { type: "text", title: "Text", folder: "Text", unit: "note" },
  { type: "font", title: "Fonts", folder: "Fonts", unit: "font" },
  { type: "other", title: "Other", folder: "Other", unit: "file" },
];

const CONFIGURED_TYPES: readonly ConfiguredAssetType[] = ["image", "audio", "video", "font"];

const TEXT_ENDINGS: readonly string[] = ["txt", "md"];

export const LINK_ENDING = "url";

export const isAssetType = (value: unknown): value is AssetType =>
  ASSET_TYPES.some((spec) => spec.type === value);

export const assetTypeSpec = (type: AssetType): AssetTypeSpec =>
  ASSET_TYPES.find((spec) => spec.type === type)!;

export const endingOf = (path: string): string => {
  const name = path.split(/[?#]/)[0]!.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const assetEndingsOf = (patterns: AssetFilePatterns): AssetEndings => ({
  image: patternEndings(patterns.imageFiles),
  audio: patternEndings(patterns.audioFiles),
  video: patternEndings(patterns.videoFiles),
  font: patternEndings(patterns.fontFiles),
});

export const assetTypeOfEnding = (ending: string, endings: AssetEndings): AssetType => {
  const lower = ending.toLowerCase();
  const configured = CONFIGURED_TYPES.find((type) => endings[type].includes(lower));
  if (configured) {
    return configured;
  }
  return TEXT_ENDINGS.includes(lower) ? "text" : "other";
};

export const isLinkPath = (path: string): boolean => endingOf(path) === LINK_ENDING;

export const assetTypeOf = (
  path: string,
  endings: AssetEndings,
  address?: string,
): AssetType =>
  isLinkPath(path)
    ? address
      ? assetTypeOfEnding(endingOf(address), endings)
      : "other"
    : assetTypeOfEnding(endingOf(path), endings);

const EMPTY_ENDINGS: AssetEndings = { image: [], audio: [], video: [], font: [] };

export const assetEndings = signal<AssetEndings>(EMPTY_ENDINGS);

export const setAssetFiles = (patterns: AssetFilePatterns): void => {
  const next = assetEndingsOf(patterns);
  const current = assetEndings.peek();
  const same = CONFIGURED_TYPES.every(
    (type) =>
      next[type].length === current[type].length &&
      next[type].every((ending, i) => ending === current[type][i]),
  );
  if (!same) {
    assetEndings.value = next;
  }
};
