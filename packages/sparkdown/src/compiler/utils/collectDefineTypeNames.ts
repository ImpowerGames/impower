import { type Tree } from "@lezer/common";

export interface DefineTypeNameOccurrence {
  from: number;
  to: number;
  name: string;
}

export interface DefineTypeNameWalkStats {
  nodes: number;
  ranges: [number, number][];
}

let tracking = false;
const stats: DefineTypeNameWalkStats = { nodes: 0, ranges: [] };

export function defineTypeNameWalkStats(): DefineTypeNameWalkStats {
  return { nodes: stats.nodes, ranges: stats.ranges.map((r) => [...r]) };
}

export function resetDefineTypeNameWalkStats(): void {
  tracking = true;
  stats.nodes = 0;
  stats.ranges = [];
}

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
