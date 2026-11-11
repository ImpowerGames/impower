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
  [typeLine(asset), (asset.variantCount ?? 0) > 1 ? plural(asset.variantCount!, "variant") : null]
    .filter(Boolean)
    .join(" · ");

export const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

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
}: {
  asset: InspectedAsset;
  home: string;
  folders: AddMenuFolders;
  measured?: MeasuredAsset;
}): DetailRow[] => {
  const rows: DetailRow[] = [{ label: "Type", value: typeLine(asset) }];
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
  image: "Nothing shows it yet. Copy its name into a script to use it.",
  audio: "Nothing plays it yet.",
  video: "Nothing plays it yet.",
  font: "No style uses it yet.",
  text: "Nothing in the story refers to it.",
  other: "Nothing in the story refers to it.",
};

export const neighborsOf = <T extends { path: string }>(items: readonly T[], path: string) => {
  const at = items.findIndex((item) => item.path === path);
  return {
    at,
    count: items.length,
    previous: at > 0 ? items[at - 1]! : null,
    next: at >= 0 && at < items.length - 1 ? items[at + 1]! : null,
  };
};
