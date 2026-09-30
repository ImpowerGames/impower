import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

// The nodes whose braces the formatter spaces on the inside when the whole
// table sits on one line: a table constructor and a table type. An
// interpolation, a binding and a handler closure are written with the same
// characters but are other nodes, so they stay tight.
const SPACED_TABLE_NAMES = nodeNameSet(["LuauTable", "LuauTypeTableStruct"]);

// The inline alternator forms. On one line their whitespace is either text
// the player shows or collapsed tight, and a table written as an
// alternator's arms is rewritten to pipes, so a table inside one keeps the
// alternator's own spacing.
const INLINE_ALTERNATOR_NAMES = nodeNameSet([
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
]);

/**
 * The offsets of the `{` and `}` of a table constructor or table type that
 * sits on one line and holds something, or `null` for any other node, an
 * empty table, a table that spans lines, a table with no closing brace and
 * a table inside a one-line inline alternator.
 *
 * The formatter writes one space after the `{` and one before the `}` of
 * such a table (`{ a = 1 }`, `{ number }`), as #1222 writes a one-line
 * block, and leaves an empty table as `{}`.
 */
export function oneLineTableBraces(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): { open: number; close: number } | null {
  if (!SPACED_TABLE_NAMES.has(node.name)) return null;
  const open = node.from;
  if (read(open, open + 1) !== "{") return null;
  // The `_end` capture begins with the `}` and carries the whitespace after
  // it, so the closing brace is its first character.
  let close: number | null = null;
  for (let child = node.lastChild; child; child = child.prevSibling) {
    if (child.name === `${node.name}_end`) {
      if (read(child.from, child.from + 1) === "}") close = child.from;
      break;
    }
  }
  if (close == null) return null;
  const inside = read(open + 1, close);
  if (!inside.trim() || /[\r\n]/.test(inside)) return null;
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (
      INLINE_ALTERNATOR_NAMES.has(ancestor.name) &&
      !/[\r\n]/.test(read(ancestor.from, ancestor.to))
    ) {
      return null;
    }
  }
  return { open, close };
}
