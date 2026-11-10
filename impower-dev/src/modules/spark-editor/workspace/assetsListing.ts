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
import { imageStacks, stemOf } from "../utils/imageStacks";
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
  paths?: string[];
  variantCount?: number;
  covers?: string[];
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

export const assetHomes = (listing: AssetPaths): string[] => {
  const found = allFolders(listing)
    .filter((folder) => !folder.includes("/") && folder.toLowerCase() === "assets")
    .sort();
  return found.length ? found : [DEFAULT_ASSETS_HOME];
};

export const assetsHome = (listing: AssetPaths): string => assetHomes(listing)[0]!;

const homeOf = (path: string, homes: readonly string[]): string | undefined =>
  homes.find((home) => isInside(path, home) && path !== home);

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

export const assetFiles = (listing: AssetPaths): string[] => {
  const homes = assetHomes(listing);
  return Object.keys(listing.files).filter((path) => homeOf(path, homes) !== undefined);
};

const knownFolders = (listing: AssetListing, homes: readonly string[]): string[] => {
  const result = new Set(listing.folders.filter((folder) => homeOf(folder, homes) !== undefined));
  for (const path of assetFiles(listing)) {
    for (let folder = parentOf(path); folder && !homes.includes(folder); folder = parentOf(folder)) {
      result.add(folder);
    }
  }
  return [...result].sort();
};

export const assetTrail = (
  listing: AssetPaths,
  root: string,
  folder: string,
): { crumbs: { name: string; path: string }[]; parent: string } => {
  if (folder === root) {
    return { crumbs: [], parent: root };
  }
  const homes = assetHomes(listing);
  const base = isInside(folder, root) ? root : (homeOf(folder, homes) ?? root);
  const parts = folder.slice(base.length + 1).split("/");
  const up = parentOf(folder);
  return {
    crumbs: parts.map((name, i) => ({ name, path: joinPath(base, parts.slice(0, i + 1).join("/")) })),
    parent: homes.includes(up) && !isInside(up, root) ? root : up,
  };
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

const stackedRows = (
  listing: AssetListing,
  paths: readonly string[],
  type: AssetType,
  locate: (path: string) => string | undefined,
): AssetRow[] => {
  if (type !== "image") {
    return paths.map((path) => fileRow(listing, path, type, locate(path)));
  }
  return imageStacks(paths).map((stack) => {
    const row = fileRow(listing, stack.cover, type, locate(stack.cover));
    if (stack.paths.length === 1 && stemOf(stack.cover) === stack.base) {
      return row;
    }
    const facts = stack.paths.map((path) => listing.files[path]!);
    return {
      ...row,
      name: stack.name,
      modified: Math.max(...facts.map((fact) => fact.modified)),
      size: facts.reduce((sum, fact) => sum + fact.size, 0),
      paths: stack.paths,
      ...(stack.variantCount > 1 ? { variantCount: stack.variantCount } : {}),
    };
  });
};

export const FOLDER_COVERS = 4;

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
  const homes = assetHomes(listing);
  const root = typeFolder(listing, type);
  const files = assetFiles(listing);
  const ofType = files.filter((path) => typeOf(listing, path, endings) === type);
  const folders = knownFolders(listing, homes);
  const typeRoots = ASSET_TYPES.map((spec) => typeFolder(listing, spec.type));
  const holds = (at: string) => ofType.some((path) => isInside(path, at));
  const empty = (at: string) => !files.some((path) => isInside(path, at));
  const outside = (at: string) => !isInside(at, root);
  const shown = (at: string) => !outside(at) || holds(at) || empty(at);
  const reachable = (at: string): boolean =>
    folders.includes(at) &&
    (!outside(at) ||
      (!typeRoots.some((typeRoot) => isInside(at, typeRoot)) && (holds(at) || empty(at))));
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
        folders.filter((f) => parentOf(f) === path && shown(f)).length,
        ofType.filter((p) => parentOf(p) === path).length,
        assetTypeSpec(type).unit,
      ),
      location,
      ...(type === "image"
        ? { covers: imageStacks(inside).slice(0, FOLDER_COVERS).map((stack) => stack.cover) }
        : {}),
    };
  };

  const childFolders = folders.filter((f) => parentOf(f) === at && shown(f));
  const strays = atRoot
    ? folders.filter(
        (f) =>
          homes.includes(parentOf(f)) &&
          !typeRoots.includes(f) &&
          (holds(f) || (type === "other" && empty(f))),
      )
    : [];
  const rows: AssetRow[] = [
    ...childFolders.map((f) => folderRow(f)),
    ...strays.map((f) => folderRow(f, parentOf(f))),
    ...stackedRows(
      listing,
      ofType.filter((path) => parentOf(path) === at),
      type,
      () => (outside(at) ? at : undefined),
    ),
    ...(atRoot
      ? stackedRows(
          listing,
          ofType.filter(
            (path) =>
              homes.includes(parentOf(path)) ||
              (outside(path) && typeRoots.some((typeRoot) => isInside(path, typeRoot))),
          ),
          type,
          parentOf,
        )
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
  const homes = assetHomes(listing);
  const files = assetFiles(listing);
  const hits = new Set(
    files.filter((path) =>
      words.every((word) =>
        path.slice((homeOf(path, homes) ?? "").length + 1).toLowerCase().includes(word),
      ),
    ),
  );
  return ASSET_TYPES.map(({ type, title }) => {
    const ofType = files.filter((path) => typeOf(listing, path, endings) === type);
    const shown =
      type === "image"
        ? imageStacks(ofType)
            .filter((stack) => stack.paths.some((path) => hits.has(path)))
            .flatMap((stack) => stack.paths)
        : ofType.filter((path) => hits.has(path));
    return {
      type,
      title,
      rows: sortEntries(
        stackedRows(listing, shown, type, (path) => placeOf(listing, path, type)),
        sort,
      ),
    };
  }).filter((group) => group.rows.length > 0);
};

export const landingFolder = (
  listing: AssetPaths,
  type: AssetType,
  current: string,
): string => {
  const root = typeFolder(listing, type);
  return current && isInside(current, root) ? current : root;
};
