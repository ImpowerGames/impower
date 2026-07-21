import { type Tree } from "@lezer/common";

// Walk a parsed tree collecting every name used as a define TYPE: an `as`-parent
// (`LuauDefineParentName`, the `X` in `define D as X`) or a `new X()` target
// (`LuauNewClassName`). These are the type / namespace-root names that must keep
// a bare Luau global; every OTHER typed define is a leaf instance scoped to a
// synthetic `$<type>_<name>` key (see scopeDefineInstances +
// project_define_namespace_scoping).
//
// A full pre-order traversal is required (not just top-level children): `new
// X()` targets live deep inside function bodies. Shared by the annotator's
// per-document scan (feeds the P2 shadow warning) and the compiler's whole-
// program pre-scan (feeds the P1 scoping post-pass).
export function collectDefineTypeNames(
  tree: Tree,
  read: (from: number, to: number) => string,
): Set<string> {
  const set = new Set<string>();
  const cursor = tree.cursor();
  do {
    if (
      cursor.name === "LuauDefineParentName" ||
      cursor.name === "LuauNewClassName"
    ) {
      set.add(read(cursor.from, cursor.to).trim());
    }
  } while (cursor.next());
  return set;
}
