import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

// The entry shapes a structural list item may carry on its own dash line:
// `- key:` (an object header) and `- key = value` (a scalar property). The
// grammar nests the ordinary body-line rule for each inside
// `LuauStructArrayItem`'s trailing capture, so a collapsed item is spelled in
// exactly the nodes every consumer already keys on.
const INLINE_ENTRY_NAMES = nodeNameSet([
  "LuauStructObjectHeader",
  "LuauStructScalarProperty",
]);

/**
 * The entry a collapsed list item carries on its dash line, or `null` for a
 * bare `-` and for a `- value` item (whose remainder is a plain value).
 *
 * A collapsed item is the expanded item with the dash overlapping its first
 * entry's indent column:
 *
 *     - eyes:            -
 *         option = open        eyes:
 *       offset = 0.4             option = open
 *                              offset = 0.4
 *
 * so every reader treats the dash line as two lines — the item marker at the
 * dash column and this entry at the column it starts in — and the two
 * spellings lower to the same struct. The formatter reconstructs a body's
 * nesting from indent columns alone and reads this for the same reason: a
 * collapsed dash line opens two levels, not one.
 */
export function structArrayItemInlineEntry(
  arrayItem: SyntaxNode,
): SyntaxNode | null {
  // Depth-first so the entry is found under the trailing capture wrapper,
  // whatever `_cN` nodes the generator puts in between.
  const find = (node: SyntaxNode): SyntaxNode | null => {
    if (INLINE_ENTRY_NAMES.has(node.name)) return node;
    let child = node.firstChild;
    while (child) {
      const found = find(child);
      if (found) return found;
      child = child.nextSibling;
    }
    return null;
  };
  return find(arrayItem);
}
