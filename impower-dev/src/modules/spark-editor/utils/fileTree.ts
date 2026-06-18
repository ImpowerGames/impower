// Pure folder-tree model for the file manager. Turns a flat list of
// project-relative paths (the keys of the workspace `Record<uri, FileData>`,
// stripped to relative paths) into a nested tree, and flattens the *expanded*
// tree into a linear list of rows for the (windowed) virtualizer in FileList.
//
// Deliberately dependency-free and DOM-free so it is unit-testable in isolation:
// the component layer owns selection/expansion state and rendering; this module
// owns only the structural math.

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
}

interface MutableNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, MutableNode>;
}

const sortNodes = (a: FileTreeNode, b: FileTreeNode): number => {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  // Stable, deterministic tiebreak for names differing only by case.
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
};

const toSortedNodes = (level: Map<string, MutableNode>): FileTreeNode[] =>
  [...level.values()]
    .map((node) => ({
      path: node.path,
      name: node.name,
      isDirectory: node.isDirectory,
      children: toSortedNodes(node.children),
    }))
    .sort(sortNodes);

/**
 * Build a nested folder tree from a flat list of project-relative paths.
 * Intermediate folders are created implicitly and deduped, so passing only leaf
 * file paths (e.g. `chapters/intro.sd`) is enough.
 */
export const buildFileTree = (
  paths: string[],
  options?: BuildFileTreeOptions,
): FileTreeNode[] => {
  const sentinels = new Set(options?.sentinelNames ?? [".folder"]);
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

  return toSortedNodes(root);
};

/**
 * Flatten the tree into the linear, display-ordered rows the virtualizer
 * renders. A folder's children are emitted only when its path is in `expanded`.
 */
export const flattenVisibleRows = (
  roots: FileTreeNode[],
  expanded: ReadonlySet<string>,
): FileTreeRow[] => {
  const rows: FileTreeRow[] = [];
  const walk = (nodes: FileTreeNode[], depth: number): void => {
    for (const node of nodes) {
      const hasChildren = node.isDirectory && node.children.length > 0;
      const isExpanded = node.isDirectory && expanded.has(node.path);
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
