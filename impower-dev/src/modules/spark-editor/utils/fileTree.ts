import type { ProjectMetadataField } from "@impower/spark-editor-protocol/src/types";
import { isScriptPath } from "./scriptFiles";

export const computeFolderMoves = (
  relativePaths: string[],
  fromFolder: string,
  toFolder: string,
): { from: string; to: string }[] => {
  const prefix = `${fromFolder.replace(/\/+$/, "")}/`;
  const dest = toFolder.replace(/\/+$/, "");
  return relativePaths
    .filter((p) => p.startsWith(prefix))
    .map((p) => ({ from: p, to: `${dest}/${p.slice(prefix.length)}` }));
};

export const canMoveFolder = (fromFolder: string, toFolder: string): boolean => {
  const from = fromFolder.replace(/\/+$/, "");
  const to = toFolder.replace(/\/+$/, "");
  return (
    to !== from && !to.startsWith(`${from}/`) && !from.startsWith(`${to}/`)
  );
};

export const CATEGORY_PREFIXES = [
  "assets/urls/",
  "scripts/",
  "assets/",
  "urls/",
];

const stripCategoryPrefix = (p: string): string => {
  for (const prefix of CATEGORY_PREFIXES) {
    if (p.startsWith(prefix)) {
      return p.slice(prefix.length);
    }
  }
  return p;
};

export const layoutSubtreeFor = (path: string): string =>
  isScriptPath(path)
    ? "scripts"
    : path.endsWith(".url")
      ? "assets/urls"
      : "assets";

const MAIN_SCRIPT = "main.sd";

export const LAYOUT_MARKER = ".layout";

export const FOLDERS_MARKER = ".folders";

const PROJECT_METADATA_FIELDS: Record<ProjectMetadataField, true> = {
  folders: true,
  layout: true,
  name: true,
  textRevisionId: true,
  textSynced: true,
  zipRevisionId: true,
  zipSynced: true,
};

export const isProjectMetadata = (relativePath: string): boolean =>
  relativePath.startsWith(".") &&
  Object.hasOwn(PROJECT_METADATA_FIELDS, relativePath.slice(1));

export const needsFolderMigration = (relativePaths: string[]): boolean =>
  !relativePaths.some(
    (p) => p === FOLDERS_MARKER || p.startsWith(`${FOLDERS_MARKER}/`),
  );

export const canWriteLayoutMarker = (relativePaths: string[]): boolean =>
  !relativePaths.some(
    (p) => p === LAYOUT_MARKER || p.startsWith(`${LAYOUT_MARKER}/`),
  );

const LEGACY_EMPTY_FOLDER_FILE = ".folder";

export const planFolderMigration = (
  files: { path: string; size?: number }[],
  directories: string[],
): { legacyFiles: string[]; folders: string[]; staleFolders: string[] } => {
  const legacyFiles = files
    .filter(
      (f) =>
        (f.path.split("/").pop() ?? f.path) === LEGACY_EMPTY_FOLDER_FILE &&
        f.size === 0,
    )
    .map((f) => f.path);
  const legacy = new Set(legacyFiles);
  const folders = withAncestors(
    legacyFiles.map((p) => p.slice(0, p.lastIndexOf("/"))).filter(Boolean),
  );
  return {
    legacyFiles,
    folders,
    staleFolders: foldersWithoutFiles(
      files.map((f) => f.path).filter((p) => !legacy.has(p)),
      directories,
      folders,
    ),
  };
};

export const foldersWithoutFiles = (
  filePaths: string[],
  directories: string[],
  keep: string[] = [],
): string[] => {
  const held = new Set([
    ...filePaths.flatMap(ancestorsOf),
    ...withAncestors(keep),
  ]);
  return directories.filter((folder) => !held.has(folder));
};

const settledTarget = (
  path: string,
  subtreeFor: (path: string) => string,
): string => {
  let target = path;
  for (let i = 0; i <= path.split("/").length; i++) {
    const next = `${subtreeFor(target)}/${stripCategoryPrefix(target)}`;
    if (next === target) break;
    target = next;
  }
  return target;
};

const folderOf = (path: string): string =>
  path.slice(0, path.lastIndexOf("/") + 1);

const ancestorsOf = (path: string): string[] => {
  const parts = path.split("/");
  return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join("/"));
};

const projectOf = (path: string, roots: string[]): string =>
  roots.reduce(
    (nearest, root) =>
      path.startsWith(root) && root.length > nearest.length ? root : nearest,
    "",
  );

const subProjectRoots = (paths: string[]): string[] =>
  paths
    .filter((p) => p !== MAIN_SCRIPT && p.endsWith(`/${MAIN_SCRIPT}`))
    .map(folderOf);

export const routeIntoLayout = (
  relativePaths: string[],
  existingPaths: string[],
  subtreeFor: (path: string) => string,
): string[] => {
  const roots = subProjectRoots([...existingPaths, ...relativePaths]);
  return relativePaths.map((p) => {
    if (
      p === MAIN_SCRIPT ||
      (p.split("/").pop() ?? p).startsWith(".") ||
      roots.some((root) => p.startsWith(root))
    ) {
      return p;
    }
    const target = settledTarget(p, subtreeFor);
    return projectOf(target, roots) === "" ? target : p;
  });
};

const planLayoutMoves = (
  relativePaths: string[],
  subtreeFor: (path: string) => string,
  repair: boolean,
  seenFolders: Set<string>,
  standingFolders: string[],
): { from: string; to: string }[] => {
  const roots = subProjectRoots(relativePaths);
  const units = roots.filter(
    (root) => !roots.some((other) => other !== root && root.startsWith(other)),
  );
  const unitOf = (path: string) => units.find((unit) => path.startsWith(unit));
  const movable = relativePaths.filter(
    (p) =>
      p !== MAIN_SCRIPT &&
      !(p.split("/").pop() ?? p).startsWith(".") &&
      !p.startsWith(`${LAYOUT_MARKER}/`),
  );
  const files = new Set(relativePaths);
  const liveFolders = new Set([
    ...standingFolders,
    ...relativePaths.flatMap(ancestorsOf),
  ]);
  const folders = new Set([...seenFolders, ...liveFolders]);
  const isFree = (to: string) =>
    !files.has(to) &&
    !folders.has(to) &&
    !ancestorsOf(to).some((folder) => files.has(folder));
  const reserve = (to: string) => {
    files.add(to);
    ancestorsOf(to).forEach((folder) => {
      folders.add(folder);
      liveFolders.add(folder);
    });
  };
  const splitRoots = roots
    .filter((root) => root.startsWith("scripts/") && root !== "scripts/")
    .map(stripCategoryPrefix);
  const unitPlans = units.map((unit) => {
    const target = `scripts/${stripCategoryPrefix(unit)}`;
    return {
      unit,
      target,
      moves:
        target === unit
          ? []
          : movable
              .filter((p) => p.startsWith(unit))
              .map((p) => ({ from: p, to: `${target}${p.slice(unit.length)}` })),
    };
  });
  const rootPlans = movable
    .filter((p) => !unitOf(p))
    .map((p) => {
      const inner = stripCategoryPrefix(p);
      const repairs =
        repair &&
        p.startsWith("assets/") &&
        splitRoots.some((root) => inner.startsWith(root));
      const to = repairs ? `scripts/${inner}` : settledTarget(p, subtreeFor);
      return { from: p, to, repairs };
    });
  const moves: { from: string; to: string }[] = [];
  const movedRoots = new Map(roots.map((root) => [root, root]));
  for (const { unit, target, moves: unitMoves } of unitPlans) {
    const targetFolder = target.slice(0, -1);
    if (
      unitMoves.length === 0 ||
      files.has(targetFolder) ||
      liveFolders.has(targetFolder) ||
      !unitMoves.every((m) => isFree(m.to))
    ) {
      continue;
    }
    unitMoves.forEach((m) => reserve(m.to));
    moves.push(...unitMoves);
    roots
      .filter((root) => root.startsWith(unit))
      .forEach((root) =>
        movedRoots.set(root, `${target}${root.slice(unit.length)}`),
      );
  }
  const finalRoots = [...movedRoots.values()];
  for (const { from, to, repairs } of rootPlans) {
    if (to === from || !isFree(to)) continue;
    if (!repairs && projectOf(to, finalRoots) !== "") continue;
    reserve(to);
    moves.push({ from, to });
  }
  return moves;
};

export const computeLayoutMigration = (
  relativePaths: string[],
  subtreeFor: (path: string) => string,
  emptyFolders: string[] = [],
): { from: string; to: string }[] =>
  computeLayoutMigrationBatches(relativePaths, subtreeFor, emptyFolders)[0] ??
  [];

const withAncestors = (folders: string[]): string[] => [
  ...new Set(folders.flatMap((folder) => [...ancestorsOf(folder), folder])),
];

export const computeLayoutMigrationBatches = (
  relativePaths: string[],
  subtreeFor: (path: string) => string,
  emptyFolders: string[] = [],
): { from: string; to: string }[][] => {
  if (relativePaths.includes(LAYOUT_MARKER)) return [];
  const batches: { from: string; to: string }[][] = [];
  const standingFolders = withAncestors(emptyFolders);
  const seenFolders = new Set<string>(standingFolders);
  let paths = relativePaths;
  for (let i = 0; i <= relativePaths.length; i++) {
    paths.flatMap(ancestorsOf).forEach((folder) => seenFolders.add(folder));
    const moves = planLayoutMoves(
      paths,
      subtreeFor,
      i === 0,
      seenFolders,
      standingFolders,
    );
    if (moves.length === 0) break;
    batches.push(moves);
    const renamed = new Map(moves.map((m) => [m.from, m.to]));
    paths = paths.map((p) => renamed.get(p) ?? p);
  }
  return batches;
};
