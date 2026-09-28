// Bounded parent walk: nearest ancestor whose name is in `names`, else null.
// Bounded so a pathological parent chain stays O(1), not O(file).
export function ancestorMatching(
  node: { parent?: any } | undefined,
  names: Set<string>,
  max = 10,
): any {
  let cur = node?.parent;
  for (let depth = 0; depth < max && cur; depth++) {
    if (names.has(cur.name)) return cur;
    cur = cur.parent;
  }
  return null;
}
