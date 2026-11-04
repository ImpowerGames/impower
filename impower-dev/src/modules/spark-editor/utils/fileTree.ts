import type { ProjectMetadataField } from "@impower/spark-editor-protocol/src/types";
import { isScriptPath } from "./scriptFiles";

export interface FileTreeNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

export interface FileTreeRow {
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

export interface BuildFileTreeOptions {
  folders?: string[];
  compareFiles?: (a: FileTreeNode, b: FileTreeNode) => number;
}

interface MutableNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, MutableNode>;
}

const extOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const makeSortNodes =
  (compareFiles?: (a: FileTreeNode, b: FileTreeNode) => number) =>
  (a: FileTreeNode, b: FileTreeNode): number => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    if (!a.isDirectory && !b.isDirectory && compareFiles) {
      const c = compareFiles(a, b);
      if (c !== 0) {
        return c;
      }
    } else if (!a.isDirectory) {
      const ae = extOf(a.name);
      const be = extOf(b.name);
      if (ae !== be) return ae < be ? -1 : 1;
    }
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  };

const toSortedNodes = (
  level: Map<string, MutableNode>,
  sorter: (a: FileTreeNode, b: FileTreeNode) => number,
): FileTreeNode[] =>
  [...level.values()]
    .map((node) => ({
      path: node.path,
      name: node.name,
      isDirectory: node.isDirectory,
      children: toSortedNodes(node.children, sorter),
    }))
    .sort(sorter);

export const buildFileTree = (
  paths: string[],
  options?: BuildFileTreeOptions,
): FileTreeNode[] => {
  const root = new Map<string, MutableNode>();
  const entries = [
    ...(options?.folders ?? []).map((path) => ({ path, isFolder: true })),
    ...paths.map((path) => ({ path, isFolder: false })),
  ];

  for (const { path: rawPath, isFolder } of entries) {
    const segments = rawPath.split("/").filter(Boolean);
    let level = root;
    let prefix = "";
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i]!;
      const isLast = i === segments.length - 1;
      const isDirectory = isFolder || !isLast;
      const nodePath = prefix ? `${prefix}/${segment}` : segment;
      let node = level.get(segment);
      if (!node) {
        node = { name: segment, path: nodePath, isDirectory, children: new Map() };
        level.set(segment, node);
      } else if (isDirectory) {
        node.isDirectory = true;
      }
      level = node.children;
      prefix = nodePath;
    }
  }

  return toSortedNodes(root, makeSortNodes(options?.compareFiles));
};

export const flattenVisibleRows = (
  roots: FileTreeNode[],
  expanded: ReadonlySet<string>,
  expandAll = false,
): FileTreeRow[] => {
  const rows: FileTreeRow[] = [];
  const walk = (nodes: FileTreeNode[], depth: number): void => {
    for (const node of nodes) {
      const hasChildren = node.isDirectory && node.children.length > 0;
      const isExpanded =
        node.isDirectory && (expandAll || expanded.has(node.path));
      rows.push({
        path: node.path,
        name: node.name,
        isDirectory: node.isDirectory,
        depth,
        hasChildren,
        expanded: isExpanded,
      });
      if (isExpanded && hasChildren) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(roots, 0);
  return rows;
};

const childrenOf = (
  roots: FileTreeNode[],
  scopePath: string,
): FileTreeNode[] | null => {
  const segments = scopePath.split("/").filter(Boolean);
  let level = roots;
  let node: FileTreeNode | undefined;
  for (const segment of segments) {
    node = level.find((n) => n.isDirectory && n.name === segment);
    if (!node) {
      return null;
    }
    level = node.children;
  }
  return node ? node.children : roots;
};

export const subtreeChildren = (
  roots: FileTreeNode[],
  prefix: string,
): FileTreeNode[] => (prefix ? (childrenOf(roots, prefix) ?? []) : roots);

export const childrenRows = (
  roots: FileTreeNode[],
  scopePath: string,
): FileTreeRow[] => {
  const children = childrenOf(roots, scopePath);
  if (!children) {
    return [];
  }
  return children.map((node) => ({
    path: node.path,
    name: node.name,
    isDirectory: node.isDirectory,
    depth: 0,
    hasChildren: node.isDirectory && node.children.length > 0,
    expanded: false,
  }));
};

export const breadcrumbSegments = (
  scopePath: string,
): { name: string; path: string }[] => {
  const segments = scopePath.split("/").filter(Boolean);
  const trail: { name: string; path: string }[] = [];
  let prefix = "";
  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment;
    trail.push({ name: segment, path: prefix });
  }
  return trail;
};

export const resolveScopePath = (
  roots: FileTreeNode[],
  scopePath: string,
): string => {
  const segments = scopePath.split("/").filter(Boolean);
  let valid = "";
  let level = roots;
  for (const segment of segments) {
    const node = level.find((n) => n.isDirectory && n.name === segment);
    if (!node) {
      break;
    }
    valid = node.path;
    level = node.children;
  }
  return valid;
};

export const descendantPaths = (
  roots: FileTreeNode[],
  folderPath: string,
): string[] => {
  const segments = folderPath.split("/").filter(Boolean);
  let level = roots;
  let node: FileTreeNode | undefined;
  for (const segment of segments) {
    node = level.find((n) => n.isDirectory && n.name === segment);
    if (!node) {
      return [];
    }
    level = node.children;
  }
  if (!node) {
    return [];
  }
  const out: string[] = [];
  const walk = (nodes: FileTreeNode[]): void => {
    for (const n of nodes) {
      out.push(n.path);
      if (n.isDirectory) {
        walk(n.children);
      }
    }
  };
  walk(node.children);
  return out;
};

export interface StickyRow {
  path: string;
  name: string;
  depth: number;
  index: number;
  offset: number;
}

export const computeStickyRows = (
  rows: FileTreeRow[],
  scrollOffset: number,
  rowHeight: number,
): StickyRow[] => {
  if (scrollOffset <= 0 || rows.length === 0 || rowHeight <= 0) {
    return [];
  }
  const topIndex = Math.min(
    rows.length - 1,
    Math.floor(scrollOffset / rowHeight),
  );
  const topRow = rows[topIndex];
  if (!topRow) {
    return [];
  }
  const stack: { row: FileTreeRow; index: number }[] = [];
  let depth = topRow.depth;
  for (let i = topIndex - 1; i >= 0 && depth > 0; i -= 1) {
    if (rows[i]!.depth === depth - 1) {
      stack.unshift({ row: rows[i]!, index: i });
      depth -= 1;
    }
  }
  if (
    topRow.isDirectory &&
    topRow.hasChildren &&
    topRow.expanded &&
    topIndex * rowHeight < scrollOffset
  ) {
    stack.push({ row: topRow, index: topIndex });
  }
  if (stack.length === 0) {
    return [];
  }
  const deepest = stack[stack.length - 1]!;
  let lastDescendant = deepest.index;
  for (let i = deepest.index + 1; i < rows.length; i += 1) {
    if (rows[i]!.depth > deepest.row.depth) {
      lastDescendant = i;
    } else {
      break;
    }
  }
  const lastSlot = stack.length - 1;
  const subtreeBottom = (lastDescendant + 1) * rowHeight - scrollOffset;
  const push = Math.min(0, subtreeBottom - (lastSlot + 1) * rowHeight);
  return stack.map((a, k) => ({
    path: a.row.path,
    name: a.row.name,
    depth: a.row.depth,
    index: a.index,
    offset: k * rowHeight + (k === lastSlot ? push : 0),
  }));
};

export const filterPaths = (paths: string[], query: string): string[] => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return paths;
  }
  return paths.filter((path) => path.toLowerCase().includes(q));
};

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
