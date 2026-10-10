import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

// A bare reassignment (`x = 5`, `a, b = b, a`): `LuauReassignment` in Luau
// code, where a comma that ends the line continues the value list on the
// next line, and `LuauSparkdownReassignment` in a narrative body, where the
// reassignment ends at its line.
export const REASSIGNMENT_NAMES = nodeNameSet([
  "LuauReassignment",
  "LuauSparkdownReassignment",
]);

/**
 * The parts of a reassignment, in order: its targets (`x`, `a.b, c[1]`),
 * which the rule's begin consumes, then the children of its content (the
 * assignment operation, and the commas and values after it).
 */
export function reassignmentParts(node: SyntaxNode): SyntaxNode[] {
  const parts: SyntaxNode[] = [];
  const begin = node.getChild(`${node.name}_begin`);
  for (let capture = begin?.firstChild ?? null; capture; capture = capture.nextSibling) {
    for (let part = capture.firstChild; part; part = part.nextSibling) {
      parts.push(part);
    }
  }
  const content = node.getChild(`${node.name}_content`);
  for (let part = content?.firstChild ?? null; part; part = part.nextSibling) {
    parts.push(part);
  }
  return parts;
}
