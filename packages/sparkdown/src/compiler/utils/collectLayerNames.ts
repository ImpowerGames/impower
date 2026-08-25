import { SparkProgram } from "../types/SparkProgram";

const MAX_DEPTH = 32;

/** Every name an author can aim a `[[show/hide/animate <layer> …]]` command at.
 *
 *  The engine resolves such a target with `UIModule.findElements`, which walks
 *  the mounted element tree for children whose NAME matches. So the targetable
 *  names are the elements declared inside `layout` / `screen` / `component`
 *  structs — `backdrop`, `portrait`, `textbox` and the author's own — plus the
 *  structs themselves, each of which mounts as an element.
 *
 *  Elements appear in a struct as nested objects; scalar properties do not. A
 *  property whose value happens to be an object is collected as well, which can
 *  only make validation more permissive — a typo that coincides with such a
 *  name goes unwarned — never produce a warning for a name that works. */
export const collectLayerNames = (program: SparkProgram): Set<string> => {
  const names = new Set<string>();
  const seen = new WeakSet<object>();
  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    if (depth > MAX_DEPTH || seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$")) {
        continue;
      }
      if (child && typeof child === "object" && !Array.isArray(child)) {
        names.add(key);
        walk(child, depth + 1);
      }
    }
  };
  for (const kind of ["layout", "screen", "component"] as const) {
    const structs = program.context?.[kind];
    if (structs && typeof structs === "object") {
      for (const [name, struct] of Object.entries(structs)) {
        names.add(name);
        walk(struct, 0);
      }
    }
  }
  return names;
};
