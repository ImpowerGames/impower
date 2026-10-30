import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "../../utils/nodeNameSet";

const BOUNDED_VALUE_NODES: ReadonlySet<string> = nodeNameSet([
  "StylingValue",
  "UnquotedStringFieldValue",
]);

const INNER_VALUE_NODES: ReadonlySet<string> = nodeNameSet([
  "NumericFieldValue",
  "BooleanFieldValue",
  "StringFieldValue",
  "StylingValueContent",
  "UnquotedString",
]);

function firstDescendant(
  node: SyntaxNode,
  names: ReadonlySet<string>,
): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) return child;
    const found = firstDescendant(child, names);
    if (found) return found;
  }
  return null;
}

export function structValueNode(value: SyntaxNode): SyntaxNode {
  if (!BOUNDED_VALUE_NODES.has(value.name)) return value;
  return firstDescendant(value, INNER_VALUE_NODES) ?? value;
}
