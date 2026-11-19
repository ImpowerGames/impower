import { clock } from "@impower/impower-ui/components";
import { isWritableImageName } from "@impower/sparkdown/src/attributes/imageFileName";
import { addMenuKindsOf, type AddMenuFolders, type AddMenuKind } from "./addMenuFolders";
import { endingOf, type AssetType } from "./assetTypes";
import { bytesLabel, plural } from "./fileListModel";

export interface DetailRow {
  label: string;
  value: string;
}

export interface InspectedFile {
  path: string;
  size: number;
  src?: string;
}

export interface InspectedAsset {
  path: string;
  name: string;
  type: AssetType;
  link?: boolean;
  address?: string;
  src?: string;
  files: readonly InspectedFile[];
  variantCount?: number;
}

export interface MeasuredAsset {
  pixels?: { width: number; height: number } | null;
  seconds?: number | null;
}

export const TYPE_LABELS: Record<AssetType, string> = {
  image: "Image",
  audio: "Audio",
  video: "Video",
  text: "Text",
  font: "Font",
  other: "File",
};

export const ADD_MENU_LABELS: Record<AddMenuKind, string> = {
  backdrop: "Backdrop",
  portrait: "Portrait",
  music: "Music",
  sound: "Sound",
};

const folderOf = (path: string) => {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
};

export const typeLine = (asset: Pick<InspectedAsset, "path" | "type" | "link" | "address">): string => {
  const ending = asset.link ? endingOf(asset.address ?? "") : endingOf(asset.path);
  return [TYPE_LABELS[asset.type], ending ? ending.toUpperCase() : null, asset.link ? "link" : null]
    .filter(Boolean)
    .join(" · ");
};

export const titleLine = (asset: InspectedAsset): string =>
  [
    asset.link ? "Link" : TYPE_LABELS[asset.type],
    (asset.variantCount ?? 0) > 1 ? plural(asset.variantCount!, "variant") : null,
  ]
    .filter(Boolean)
    .join(" · ");

export const whereOf = (path: string, home: string): string => {
  const folder = folderOf(path);
  if (!folder || folder === home) {
    return "Assets root";
  }
  return folder.startsWith(`${home}/`) ? folder.slice(home.length + 1) : folder;
};

const addMenuLine = (path: string, type: AssetType, folders: AddMenuFolders): string | null => {
  const kinds = addMenuKindsOf({ path, type }, folders);
  if (!kinds.length) {
    return null;
  }
  const parts = folderOf(path).split("/");
  return kinds
    .map((kind) => {
      const wanted = folders[kind].trim().toLowerCase();
      const name = [...parts].reverse().find((part) => part.toLowerCase() === wanted) ?? folders[kind].trim();
      return `${ADD_MENU_LABELS[kind]}, from the ${name} folder`;
    })
    .join("; ");
};

export const assetDetails = ({
  asset,
  home,
  folders,
  measured = {},
  usedAs = [],
}: {
  asset: InspectedAsset;
  usedAs?: readonly string[];
  home: string;
  folders: AddMenuFolders;
  measured?: MeasuredAsset;
}): DetailRow[] => {
  const rows: DetailRow[] = [{ label: "Type", value: typeLine(asset) }];
  if (usedAs.length) {
    rows.push({ label: "Used as", value: usedAs.join(", ") });
  }
  const addMenu = addMenuLine(asset.path, asset.type, folders);
  if (addMenu) {
    rows.push({ label: "Add menu", value: addMenu });
  }
  if (measured.pixels) {
    rows.push({ label: "Size", value: `${measured.pixels.width} × ${measured.pixels.height}` });
  }
  if (measured.seconds != null && Number.isFinite(measured.seconds) && measured.seconds > 0) {
    rows.push({ label: "Length", value: clock(measured.seconds) });
  }
  const total = asset.files.reduce((sum, file) => sum + file.size, 0);
  rows.push(
    asset.files.length === 1
      ? { label: "File", value: bytesLabel(total) }
      : { label: "Files", value: `${plural(asset.files.length, "file")} · ${bytesLabel(total)}` },
  );
  rows.push({ label: "Where", value: whereOf(asset.path, home) });
  return rows;
};

export const NOT_USED_NOTES: Record<AssetType, string> = {
  image: "Nothing shows it yet. Copy its name into a line of the script.",
  audio: "Nothing plays it yet.",
  video: "Nothing plays it yet.",
  font: "No style uses it yet.",
  text: "Nothing in the story refers to it.",
  other: "Nothing in the story refers to it.",
};

export const NOT_USED_VARIANTS_NOTE =
  "Nothing shows it yet. Copy its name into a line of the script, or insert a variant from above.";

export const UNWRITABLE_NAME_NOTE =
  "Nothing shows it yet. A script can't write this name: an @ must sit between two letters, digits or _, and a name can't start with ~. Rename the file to use it.";

export const notUsedNote = (asset: Pick<InspectedAsset, "name" | "type">, stack: boolean): string =>
  asset.type === "image" && !isWritableImageName(asset.name)
    ? UNWRITABLE_NAME_NOTE
    : stack
      ? NOT_USED_VARIANTS_NOTE
      : NOT_USED_NOTES[asset.type];

export const neighborsOf = <T extends { path: string }>(items: readonly T[], path: string) => {
  const at = items.findIndex((item) => item.path === path);
  return {
    at,
    count: items.length,
    previous: at > 0 ? items[at - 1]! : null,
    next: at >= 0 && at < items.length - 1 ? items[at + 1]! : null,
  };
};
