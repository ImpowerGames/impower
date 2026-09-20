import { type Tree } from "@lezer/common";

export interface DefineTypeNameOccurrence {
  from: number;
  to: number;
  name: string;
}

/**
 * What the collector did since tracking was turned on. Tests read this to
 * assert that an edit re-walks only the region the parser rebuilt rather than
 * the whole document.
 */
export interface DefineTypeNameWalkStats {
  /** Tree nodes the walk stepped over, across every call. */
  nodes: number;
  /** One `[from, to]` per call, in call order. */
  ranges: [number, number][];
}

// Off until a test turns it on with `resetDefineTypeNameWalkStats`, so a
// long editing session accumulates nothing.
let tracking = false;
const stats: DefineTypeNameWalkStats = { nodes: 0, ranges: [] };

export function defineTypeNameWalkStats(): DefineTypeNameWalkStats {
  return { nodes: stats.nodes, ranges: stats.ranges.map((r) => [...r]) };
}

/** Start counting, from zero. */
export function resetDefineTypeNameWalkStats(): void {
  tracking = true;
  stats.nodes = 0;
  stats.ranges = [];
}

/**
 * Every name a region of a parsed tree uses as a define TYPE, with its
 * position: an `as`-parent (`LuauDefineParentName`, the `X` in `define D as X`)
 * or a `new X()` target (`LuauNewClassName`). These are the type / namespace-
 * root names that must keep a bare Luau global; every OTHER typed define is a
 * leaf instance scoped to a synthetic `$<type>_<name>` key (see
 * scopeDefineInstances + project_define_namespace_scoping).
 *
 * The traversal descends the whole region rather than its top-level children,
 * because a `new X()` target lives deep inside a function body. `from`/`to`
 * bound it; as in `Tree.iterate`, a node meeting the bound at either end is
 * still visited, so a name straddling a boundary is collected.
 */
export function collectDefineTypeNameOccurrences(
  tree: Tree,
  read: (from: number, to: number) => string,
  from: number = 0,
  to: number = tree.length,
): DefineTypeNameOccurrence[] {
  const occurrences: DefineTypeNameOccurrence[] = [];
  if (tracking) {
    stats.ranges.push([from, to]);
  }
  tree.iterate({
    from,
    to,
    enter: (nodeRef) => {
      if (tracking) {
        stats.nodes += 1;
      }
      if (
        nodeRef.name === "LuauDefineParentName" ||
        nodeRef.name === "LuauNewClassName"
      ) {
        occurrences.push({
          from: nodeRef.from,
          to: nodeRef.to,
          name: read(nodeRef.from, nodeRef.to).trim(),
        });
      }
      return undefined;
    },
  });
  return occurrences;
}

/**
 * The same names as a set, for a caller with one tree and no edits to carry the
 * result through. `DefineTypeNameIndex` is what a document being edited uses.
 */
export function collectDefineTypeNames(
  tree: Tree,
  read: (from: number, to: number) => string,
  from: number = 0,
  to: number = tree.length,
): Set<string> {
  const set = new Set<string>();
  for (const occurrence of collectDefineTypeNameOccurrences(
    tree,
    read,
    from,
    to,
  )) {
    set.add(occurrence.name);
  }
  return set;
}
