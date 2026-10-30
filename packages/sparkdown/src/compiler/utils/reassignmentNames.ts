import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

export const REASSIGNMENT_NAMES = nodeNameSet([
  "LuauReassignment",
  "LuauSparkdownReassignment",
]);

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
