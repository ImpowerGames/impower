import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "../../utils/nodeNameSet";

// The struct value rules that end a value before its trailing comment: each
// holds the value node and, after it, the comment as a sibling.
const BOUNDED_VALUE_NODES: ReadonlySet<string> = nodeNameSet([
  "StylingValue",
  "UnquotedStringFieldValue",
]);

// The value node inside one: a literal, or the text of any other value.
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

/**
 * The node a struct value reads from. `StylingValue` and
 * `UnquotedStringFieldValue` hold the value and any trailing comment, so a
 * reader takes the value node inside them; any other value node is its own
 * value.
 */
export function structValueNode(value: SyntaxNode): SyntaxNode {
  if (!BOUNDED_VALUE_NODES.has(value.name)) return value;
  return firstDescendant(value, INNER_VALUE_NODES) ?? value;
}
