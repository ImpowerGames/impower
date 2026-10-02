import type { SyntaxNode } from "@lezer/common";
import {
  ALL_INLINE_ALTERNATOR_NAMES,
  isInsideOneLineAlternator,
} from "./inlineAlternators";
import { nodeNameSet } from "./nodeNameSet";

// The nodes whose braces the formatter spaces on the inside when the whole
// table sits on one line: a table constructor and a table type. An
// interpolation, a binding and a handler closure are written with the same
// characters but are other nodes, so they stay tight.
const SPACED_TABLE_NAMES = nodeNameSet(["LuauTable", "LuauTypeTableStruct"]);

// The `}` that closes a braced node (a table, or a brace body's block or
// closure, #1227), or `null` when it has none. The node's `_end` capture
// begins with the `}` and carries the whitespace after it.
export function closingBrace(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): number | null {
  for (let child = node.lastChild; child; child = child.prevSibling) {
    if (child.name === `${node.name}_end`) {
      return read(child.from, child.from + 1) === "}" ? child.from : null;
    }
  }
  return null;
}

// A table inside a one-line inline alternator keeps the alternator's own
// spacing: there whitespace is either text the player shows or collapsed
// tight, and a table written as the alternator's arms is rewritten to pipes.
function isSpacedTable(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean {
  return (
    SPACED_TABLE_NAMES.has(node.name) &&
    read(node.from, node.from + 1) === "{" &&
    !isInsideOneLineAlternator(node, read, ALL_INLINE_ALTERNATOR_NAMES)
  );
}

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
  if (!isSpacedTable(node, read)) return null;
  const close = closingBrace(node, read);
  if (close == null) return null;
  const inside = read(node.from + 1, close);
  if (!inside.trim() || /[\r\n]/.test(inside)) return null;
  return { open: node.from, close };
}

// Whether the brace at `pos` is one of a table's own braces, which the
// table's inner spacing already separates from a brace beside it.
function isTableBrace(
  node: SyntaxNode,
  pos: number,
  read: (from: number, to: number) => string,
): boolean {
  for (
    let owner: SyntaxNode | null = node.resolveInner(pos, 1);
    owner;
    owner = owner.parent
  ) {
    if (SPACED_TABLE_NAMES.has(owner.name)) {
      return owner.from === pos || closingBrace(owner, read) === pos;
    }
  }
  return false;
}

/**
 * The offsets where the formatter keeps one space between a table and an
 * enclosing brace that is not a table's, such as an interpolation or a
 * binding: `before` is the table's `{` when only spaces separate it from a
 * `{` before it on its line, and, when there is a `before`, `after` is just
 * past its `}` when only spaces separate that from a `}` after it.
 *
 * Joining the two braces would write `{{`, which reads as the
 * `{{fn(args)}}` call shorthand instead of a table (`#value={ { a = 1 } }`),
 * so this applies to an empty or multi-line table too.
 */
export function tableOuterGaps(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): { before: number | null; after: number | null } {
  const gaps = { before: null as number | null, after: null as number | null };
  if (!isSpacedTable(node, read)) return gaps;
  let prev = node.from - 1;
  while (prev >= 0 && /[ \t]/.test(read(prev, prev + 1))) prev -= 1;
  if (prev >= 0 && read(prev, prev + 1) === "{" && !isTableBrace(node, prev, read)) {
    gaps.before = node.from;
  }
  // A `}}` alone reads as nothing else (`{f{ 1 }}`), so the closing side
  // matches the opening one only when the table fills the enclosing braces.
  const close = gaps.before == null ? null : closingBrace(node, read);
  if (close != null) {
    let next = close + 1;
    while (/[ \t]/.test(read(next, next + 1))) next += 1;
    if (read(next, next + 1) === "}" && !isTableBrace(node, next, read)) {
      gaps.after = close + 1;
    }
  }
  return gaps;
}
