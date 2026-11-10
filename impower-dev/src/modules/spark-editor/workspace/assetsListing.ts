import {
  ASSET_TYPES,
  assetTypeOf,
  assetTypeSpec,
  isLinkPath,
  type AssetEndings,
  type AssetType,
} from "../utils/assetTypes";
import {
  holdingsLabel,
  parseSort,
  sortEntries,
  sortKey,
  UNREACHED,
  type ListEntry,
  type SortField,
} from "../utils/fileListModel";
import { isInside, joinPath, nameOf, parentOf } from "./scriptsListing";

export interface AssetFacts {
  modified: number;
  size: number;
  src?: string;
  address?: string;
}

export interface AssetPaths {
  files: Readonly<Record<string, unknown>>;
  folders: readonly string[];
}

export interface AssetListing extends AssetPaths {
  projectId?: string;
  files: Record<string, AssetFacts>;
  folders: string[];
}

export interface AssetRow extends ListEntry {
  type: AssetType;
  link?: boolean;
  holdings?: string;
  location?: string;
}

export interface AssetLevel {
  type: AssetType;
  root: string;
  folder: string;
  rows: AssetRow[];
  files: number;
  empty: boolean;
  none: boolean;
}

export interface AssetGroup {
  type: AssetType;
  title: string;
  rows: AssetRow[];
}

export const DEFAULT_ASSETS_HOME = "Assets";

export const ASSET_SORT_FIELDS: readonly SortField[] = ["name", "modified", "size"];

export const assetSort = (value: unknown): string => {
  const parsed = parseSort(value);
  return sortKey(
    ASSET_SORT_FIELDS.includes(parsed.field) ? parsed : { field: "name", direction: "asc" },
  );
};

const allFolders = (listing: AssetPaths): string[] => {
  const result = new Set<string>();
  for (const start of [...listing.folders, ...Object.keys(listing.files).map(parentOf)]) {
    for (let folder = start; folder; folder = parentOf(folder)) {
      result.add(folder);
    }
  }
  return [...result];
};

export const assetsHome = (listing: AssetPaths): string =>
  allFolders(listing)
    .filter((folder) => !folder.includes("/"))
    .find((folder) => folder.toLowerCase() === "assets") ?? DEFAULT_ASSETS_HOME;

export const typeFolder = (
  listing: AssetPaths,
  type: AssetType,
): string => {
  const home = assetsHome(listing);
  const wanted = assetTypeSpec(type).folder;
  const inHome = allFolders(listing)
    .filter((folder) => parentOf(folder) === home)
    .map(nameOf);
  return joinPath(
    home,
    inHome.find((name) => name.toLowerCase() === wanted.toLowerCase()) ?? wanted,
  );
};

export const assetName = (path: string): string => {
  const name = nameOf(path);
  const dot = name.indexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

export const assetFiles = (listing: AssetListing): string[] => {
  const home = assetsHome(listing);
  return Object.keys(listing.files).filter((path) => isInside(path, home) && path !== home);
};

const knownFolders = (listing: AssetListing, home: string): string[] => {
  const result = new Set(
    listing.folders.filter((folder) => isInside(folder, home) && folder !== home),
  );
  for (const path of assetFiles(listing)) {
    for (let folder = parentOf(path); folder && folder !== home; folder = parentOf(folder)) {
      result.add(folder);
    }
  }
  return [...result].sort();
};

const typeOf = (listing: AssetListing, path: string, endings: AssetEndings): AssetType =>
  assetTypeOf(path, endings, listing.files[path]?.address);

const fileRow = (
  listing: AssetListing,
  path: string,
  type: AssetType,
  location?: string,
): AssetRow => {
  const facts = listing.files[path]!;
  return {
    kind: "file",
    path,
    name: assetName(path),
    modified: facts.modified,
    size: facts.size,
    uses: 0,
    position: UNREACHED,
    type,
    link: isLinkPath(path) || undefined,
    location,
  };
};

export const placeOf = (
  listing: AssetListing,
  path: string,
  type: AssetType,
): string => {
  const root = typeFolder(listing, type);
  const folder = parentOf(path);
  if (folder === root) {
    return assetTypeSpec(type).title;
  }
  return isInside(folder, root) ? folder.slice(root.length + 1) : folder;
};

export interface AssetLevelOptions {
  listing: AssetListing;
  type: AssetType;
  folder?: string;
  sort: unknown;
  endings: AssetEndings;
}

export const assetLevel = ({
  listing,
  type,
  folder,
  sort,
  endings,
}: AssetLevelOptions): AssetLevel => {
  const home = assetsHome(listing);
  const root = typeFolder(listing, type);
  const files = assetFiles(listing);
  const ofType = files.filter((path) => typeOf(listing, path, endings) === type);
  const folders = knownFolders(listing, home);
  const typeRoots = ASSET_TYPES.map((spec) => typeFolder(listing, spec.type));
  const holds = (at: string) => ofType.some((path) => isInside(path, at));
  const outside = (at: string) => !isInside(at, root);
  const reachable = (at: string): boolean =>
    folders.includes(at) &&
    (!outside(at) ||
      (!typeRoots.some((typeRoot) => isInside(at, typeRoot)) &&
        (holds(at) || type === "other")));
  const at = folder && folder !== root && reachable(folder) ? folder : root;
  const atRoot = at === root;

  const folderRow = (path: string, location?: string): AssetRow => {
    const inside = ofType.filter((p) => isInside(p, path));
    return {
      kind: "folder",
      path,
      name: nameOf(path),
      modified: Math.max(0, ...inside.map((p) => listing.files[p]!.modified)),
      size: inside.reduce((sum, p) => sum + listing.files[p]!.size, 0),
      uses: 0,
      position: UNREACHED,
      type,
      holdings: holdingsLabel(
        folders.filter((f) => parentOf(f) === path && (!outside(f) || holds(f))).length,
        ofType.filter((p) => parentOf(p) === path).length,
        assetTypeSpec(type).unit,
      ),
      location,
    };
  };

  const childFolders = folders.filter(
    (f) => parentOf(f) === at && (!outside(f) || holds(f)),
  );
  const strays = atRoot
    ? folders.filter(
        (f) =>
          parentOf(f) === home &&
          !typeRoots.includes(f) &&
          (holds(f) || (type === "other" && !files.some((p) => isInside(p, f)))),
      )
    : [];
  const rows: AssetRow[] = [
    ...childFolders.map((f) => folderRow(f)),
    ...strays.map((f) => folderRow(f, home)),
    ...ofType
      .filter((path) => parentOf(path) === at)
      .map((path) => fileRow(listing, path, type, outside(at) ? at : undefined)),
    ...(atRoot
      ? ofType
          .filter((path) => parentOf(path) === home)
          .map((path) => fileRow(listing, path, type, home))
      : []),
  ];
  return {
    type,
    root,
    folder: at,
    rows: sortEntries(rows, sort),
    files: ofType.length,
    empty: rows.length === 0,
    none: files.length === 0,
  };
};

export interface AssetSearchOptions {
  listing: AssetListing;
  query: string;
  sort: unknown;
  endings: AssetEndings;
}

export const assetSearch = ({
  listing,
  query,
  sort,
  endings,
}: AssetSearchOptions): AssetGroup[] => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }
  const home = assetsHome(listing);
  const hits = assetFiles(listing).filter((path) =>
    words.every((word) => path.slice(home.length + 1).toLowerCase().includes(word)),
  );
  return ASSET_TYPES.map(({ type, title }) => ({
    type,
    title,
    rows: sortEntries(
      hits
        .filter((path) => typeOf(listing, path, endings) === type)
        .map((path) => fileRow(listing, path, type, placeOf(listing, path, type))),
      sort,
    ),
  })).filter((group) => group.rows.length > 0);
};

export const landingFolder = (
  listing: AssetPaths,
  type: AssetType,
  current: string,
): string => {
  const root = typeFolder(listing, type);
  return current && isInside(current, root) ? current : root;
};
