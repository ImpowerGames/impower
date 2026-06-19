// Pure folder-tree model for the file manager. Turns a flat list of
// project-relative paths (the keys of the workspace `Record<uri, FileData>`,
// stripped to relative paths) into a nested tree, and flattens the *expanded*
// tree into a linear list of rows for the (windowed) virtualizer in FileList.
//
// Deliberately dependency-free and DOM-free so it is unit-testable in isolation:
// the component layer owns selection/expansion state and rendering; this module
// owns only the structural math.

/**
 * Hidden marker file that persists an (otherwise empty) folder. OPFS dirs are
 * implicit — they exist only while they contain a file — so creating an empty
 * folder writes this sentinel. buildFileTree treats it as a folder marker and
 * never renders it as a file.
 */
export const FOLDER_SENTINEL = ".folder";

export interface FileTreeNode {
  /** Project-relative path. For a folder this is the path WITHOUT a trailing slash. */
  path: string;
  /** Last path segment — the display name. */
  name: string;
  isDirectory: boolean;
  /** Folders first, then files; each group sorted case-insensitively. Empty for files. */
  children: FileTreeNode[];
}

export interface FileTreeRow {
  path: string;
  name: string;
  isDirectory: boolean;
  /** 0 = top level; increments per folder depth (drives indentation). */
  depth: number;
  /** A folder with at least one child (drives the disclosure chevron). */
  hasChildren: boolean;
  /** A folder whose path is in the expanded set (drives chevron direction). */
  expanded: boolean;
}

export interface BuildFileTreeOptions {
  /**
   * Basenames treated as empty-folder sentinels: they materialize their parent
   * folder but are NOT shown as files. OPFS dirs are implicit (they only exist
   * while they contain a file), so an empty folder is persisted by writing a
   * sentinel like `.folder`. Default: `[".folder"]`.
   */
  sentinelNames?: string[];
  /**
   * Optional comparator applied to FILE siblings only (folders always sort
   * first, by name). Lets the file list sort by modified/size/type — the
   * comparator closes over the per-path metadata. When omitted, files fall back
   * to the default extension-then-name grouping.
   */
  compareFiles?: (a: FileTreeNode, b: FileTreeNode) => number;
}

interface MutableNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, MutableNode>;
}

/** Lowercased final extension of a basename, or `""` when it has none. */
const extOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const makeSortNodes =
  (compareFiles?: (a: FileTreeNode, b: FileTreeNode) => number) =>
  (a: FileTreeNode, b: FileTreeNode): number => {
    // Folders always sort first.
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    // Files: defer to the caller's comparator (sort by modified/size/type) when
    // provided; otherwise group by extension first (all `.png` together, then
    // `.sd`, …) then alphabetically. Folders always sort by name.
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
    // Stable, deterministic tiebreak for names differing only by case.
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

/**
 * Build a nested folder tree from a flat list of project-relative paths.
 * Intermediate folders are created implicitly and deduped, so passing only leaf
 * file paths (e.g. `chapters/intro.sd`) is enough.
 */
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
    // For a sentinel, every kept segment is a folder (the sentinel itself is
    // dropped); otherwise the last segment is a file and the rest are folders.
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
        // A folder segment always wins over a same-named file leaf (degenerate
        // input where a name is used as both a file and a folder).
        node.isDirectory = true;
      }
      level = node.children;
      prefix = nodePath;
    }
  }

  return toSortedNodes(root, makeSortNodes(options?.compareFiles));
};

/**
 * Flatten the tree into the linear, display-ordered rows the virtualizer
 * renders. A folder's children are emitted only when its path is in `expanded`,
 * unless `expandAll` is set (used while searching, so matches buried in
 * collapsed folders are revealed).
 */
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

/**
 * Direct children of the folder `scopePath` (`""` = project root). Walks the
 * path segment by segment; returns `null` when `scopePath` doesn't resolve to a
 * folder (e.g. it was deleted while scoped into it). Sibling names are unique
 * within a folder, so name-matching per level is exact.
 */
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

/**
 * The "dive mode" rows: the direct children of `scopePath`, each as a depth-0
 * row (mobile shows one folder level at a time, so there is no indentation).
 * Returns `[]` when `scopePath` no longer resolves to a folder.
 */
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

/**
 * Breadcrumb trail for `scopePath`, shallowest → deepest, as `{ name, path }`
 * (the cumulative path each crumb scopes to). Excludes the root — the UI renders
 * its own root/home crumb. `""` → `[]`.
 */
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

/**
 * The deepest existing ancestor of `scopePath` (itself included) that still
 * resolves to a folder in `roots`. Recovers the dive-mode scope after the
 * scoped folder — or one of its ancestors — is deleted or renamed; `""` (root)
 * always resolves.
 */
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

/**
 * Every descendant node path (files AND subfolders) beneath `folderPath`, NOT
 * including `folderPath` itself. `""` / a path that doesn't resolve to a folder
 * → `[]`. Used to cascade a folder's checkbox selection to everything inside it.
 */
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
  /** Index of the folder's row in the flattened list (for scroll-to-on-click). */
  index: number;
  /** Vertical px offset within the pinned stack (slot top, minus push-out). */
  offset: number;
}

/**
 * VS Code "sticky scroll": the expanded ancestor folders of whatever row sits at
 * the top of the scroller, to be pinned as headers. Walks the flattened `rows`
 * back from the top row to collect its ancestor folder at each shallower depth
 * (shallow → deep), then slides the DEEPEST header up as its folder's contents
 * scroll past (so it eases out instead of popping). Tree mode only — the caller
 * passes `[]`/skips it in dive mode.
 */
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
  // Ancestor folder rows (shallow → deep): the nearest preceding row at each
  // shallower depth (which, by tree construction, is always a folder).
  const stack: { row: FileTreeRow; index: number }[] = [];
  let depth = topRow.depth;
  for (let i = topIndex - 1; i >= 0 && depth > 0; i -= 1) {
    if (rows[i]!.depth === depth - 1) {
      stack.unshift({ row: rows[i]!, index: i });
      depth -= 1;
    }
  }
  // If the top row is itself an OPEN folder whose own row has started scrolling
  // off the top, pin it too — so a folder sticks the moment it reaches the top,
  // not only once its first child does.
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
  // Push the deepest header up (eventually clipped above the stack) as the
  // bottom of its subtree scrolls past, so it eases out instead of popping.
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

/**
 * Case-insensitive substring filter over the full relative path. Because the
 * tree is rebuilt from the surviving paths, a match keeps its ancestor folders
 * automatically (typing a folder name reveals everything beneath it).
 */
export const filterPaths = (paths: string[], query: string): string[] => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return paths;
  }
  return paths.filter((path) => path.toLowerCase().includes(q));
};

/**
 * Compute the `{ from, to }` relative-path moves needed to relocate
 * `fromFolder` (and everything beneath it) so it becomes `toFolder`. Drives
 * WorkspaceFileSystem.moveFolder, which renames each file across directories.
 * Returns `[]` when nothing lives under `fromFolder`.
 *
 * Example: relocating `chapters` -> `archive/chapters` rewrites
 * `chapters/intro.sd` to `archive/chapters/intro.sd`.
 */
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
