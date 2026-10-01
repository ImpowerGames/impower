import { nodeNameSet } from "./nodeNameSet";

// A bare reassignment (`x = 5`, `a, b = b, a`): `LuauReassignment` in Luau
// code, where a comma that ends the line continues the value list on the
// next line, and `LuauSparkdownReassignment` in a narrative body, where the
// reassignment ends at its line. Both have the same begin and content, so
// their content nodes are `<name>_content`.
export const REASSIGNMENT_NAMES = nodeNameSet([
  "LuauReassignment",
  "LuauSparkdownReassignment",
]);

export const REASSIGNMENT_CONTENT_NAMES = nodeNameSet([
  "LuauReassignment_content",
  "LuauSparkdownReassignment_content",
]);
