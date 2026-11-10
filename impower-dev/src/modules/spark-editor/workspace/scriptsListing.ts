import {
  holdingsLabel,
  plural,
  referenceCounts,
  sortEntries,
  storyOrder,
  storyPositions,
  type ListEntry,
  type Reference,
} from "../utils/fileListModel";

export interface ScriptFacts {
  modified: number;
  size: number;
}

export interface ScriptListing {
  projectId?: string;
  files: Record<string, ScriptFacts>;
  folders: string[];
}

export interface ScriptRow extends ListEntry {
  holdings?: string;
  location?: string;
}

export const MAIN_SCRIPT = "main.sd";
export const DEFAULT_SCRIPTS_HOME = "Scripts";
export const SCRIPTS_ROOT_LABEL = "Scripts";

export const nameOf = (path: string): string => path.split("/").pop() ?? path;

export const parentOf = (path: string): string =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

export const joinPath = (folder: string, leaf: string): string =>
  folder ? `${folder}/${leaf}` : leaf;

export const isInside = (path: string, folder: string): boolean =>
  path === folder || path.startsWith(`${folder}/`);

export const scriptsHome = (listing: Pick<ScriptListing, "folders">): string =>
  listing.folders.find((f) => f.toLowerCase() === "scripts") ??
  DEFAULT_SCRIPTS_HOME;

export const realFolder = (folder: string, home: string): string =>
  folder || home;

export const browseParent =(path: string, home: string): string => {
  const parent = parentOf(path);
  return parent === home ? "" : parent;
};

export const shownPath = (path: string, home: string): string =>
  path === home
    ? ""
    : path.startsWith(`${home}/`)
      ? path.slice(home.length + 1)
      : path;

export const folderLabel = (folder: string, home: string): string =>
  shownPath(folder, home) || SCRIPTS_ROOT_LABEL;


export const MAIN_STAYS = "Main stays at the root of your story.";
export const INTO_ITSELF = "A folder cannot be moved inside itself.";

export const itemsLabel = (paths: readonly string[]): string =>
  paths.length === 1 ? nameOf(paths[0]!) : plural(paths.length, "item");

export const outermost = (paths: readonly string[]): string[] =>
  [...new Set(paths)]
    .filter((p) => !paths.some((other) => other !== p && isInside(p, other)))
    .sort();

export type MoveCheck = { moving: string[] } | { refused: string };

export const moveCheck = (
  listing: ScriptListing,
  paths: readonly string[],
  folder: string,
): MoveCheck => {
  const target = realFolder(folder, scriptsHome(listing));
  const items = outermost(paths);
  if (items.includes(MAIN_SCRIPT)) {
    return { refused: MAIN_STAYS };
  }
  if (
    items.some(
      (p) => !Object.hasOwn(listing.files, p) && isInside(target, p),
    )
  ) {
    return { refused: INTO_ITSELF };
  }
  return { moving: items.filter((p) => parentOf(p) !== target) };
};

export const crumbsOf =(folder: string, home: string) => {
  const shown = shownPath(folder, home);
  const parts = shown ? shown.split("/") : [];
  const base = folder.slice(0, folder.length - shown.length).replace(/\/$/, "");
  return parts.map((part, i) => ({
    name: part,
    path: joinPath(base, parts.slice(0, i + 1).join("/")),
  }));
};

export const scriptFolders = (listing: ScriptListing): string[] => {
  const home = scriptsHome(listing);
  const result = new Set(
    listing.folders.filter((f) => isInside(f, home) && f !== home),
  );
  for (const path of Object.keys(listing.files)) {
    for (let folder = parentOf(path); folder; folder = parentOf(folder)) {
      if (folder !== home) {
        result.add(folder);
      }
    }
  }
  return [...result].sort();
};

export interface ScriptRowsOptions {
  listing: ScriptListing;
  references: readonly Reference[];
  folder: string;
  query: string;
  sort: unknown;
}

export const scriptRows = ({
  listing,
  references,
  folder,
  query,
  sort,
}: ScriptRowsOptions): ScriptRow[] => {
  const home = scriptsHome(listing);
  const files = Object.keys(listing.files);
  const folders = scriptFolders(listing);
  const uses = referenceCounts(references);
  const position = storyPositions(storyOrder(MAIN_SCRIPT, references));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = (path: string) =>
    words.length
      ? words.every((word) => shownPath(path, home).toLowerCase().includes(word))
      : browseParent(path, home) === folder;

  const rows: ScriptRow[] = [];
  for (const path of folders) {
    if (!visible(path)) {
      continue;
    }
    const inside = files.filter((p) => isInside(p, path));
    rows.push({
      kind: "folder",
      path,
      name: nameOf(path),
      modified: Math.max(0, ...inside.map((p) => listing.files[p]!.modified)),
      size: inside.reduce((sum, p) => sum + listing.files[p]!.size, 0),
      uses: 0,
      position: position(path, "folder"),
      holdings: holdingsLabel(
        folders.filter((f) => browseParent(f, home) === path).length,
        files.filter((p) => browseParent(p, home) === path).length,
        "script",
      ),
      location: words.length
        ? folderLabel(browseParent(path, home), home)
        : undefined,
    });
  }
  for (const path of files) {
    if (!visible(path)) {
      continue;
    }
    const facts = listing.files[path]!;
    const main = path === MAIN_SCRIPT;
    rows.push({
      kind: "file",
      path,
      name: main ? "Main" : nameOf(path),
      modified: facts.modified,
      size: facts.size,
      uses: uses(path),
      position: position(path, "file"),
      pinned: main,
      location: words.length
        ? folderLabel(browseParent(path, home), home)
        : undefined,
    });
  }
  return sortEntries(rows, sort);
};
