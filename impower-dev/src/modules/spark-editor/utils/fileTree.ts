import { isScriptPath } from "./scriptFiles";

export const FOLDER_SENTINEL = ".folder";

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
  sentinelNames?: string[];
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
  const sentinels = new Set(options?.sentinelNames ?? [FOLDER_SENTINEL]);
  const root = new Map<string, MutableNode>();

  for (const rawPath of paths) {
    const segments = rawPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      continue;
    }
    const leaf = segments[segments.length - 1]!;
    const isSentinel = sentinels.has(leaf);
    const kept = isSentinel ? segments.slice(0, -1) : segments;

    let level = root;
    let prefix = "";
    for (let i = 0; i < kept.length; i += 1) {
      const segment = kept[i]!;
      const isLast = i === kept.length - 1;
      const isDirectory = isSentinel ? true : !isLast;
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

export const computeLayoutMigration = (
  relativePaths: string[],
  subtreeFor: (path: string) => string,
): { from: string; to: string }[] => {
  const moves: { from: string; to: string }[] = [];
  for (const p of relativePaths) {
    if (p === "main.sd") continue;
    const base = p.split("/").pop() ?? p;
    if (base.startsWith(".")) continue;
    const inner = stripCategoryPrefix(p);
    const to = `${subtreeFor(p)}/${inner}`;
    if (to !== p) {
      moves.push({ from: p, to });
    }
  }
  return moves;
};
