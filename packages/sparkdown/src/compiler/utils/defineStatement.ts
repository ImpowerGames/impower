import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { findOwnDeclarationName } from "../lower/utils/findOwnDeclarationName";
import { followsDanglingDot, followsMissingValue, TRIVIA_BEFORE_STATEMENT } from "../lower/utils/statementBefore";
import { isDefineMethodCall } from "./defineMethodCall";
import { nodeNameSet } from "./nodeNameSet";
import { REASSIGNMENT_NAMES } from "./reassignmentNames";
import { UNREAD_TOKENS } from "./unreadTokens";

// A `define` body lowers its members, and reads each of its other lines as
// a Luau statement, whose syntax errors that reading reports, every one, in
// Luau's words at Luau's range (`reportDefineStatement`, I-1489). It is
// their one owner: the tree checks that would report one of them leave it to
// the reading (`checkerReadsOnTo`), as they leave a method's body to its
// lowerer's. Which lines the reading reads is decided here, once, for both.

// The nodes that begin a statement of a define body: an expression, a
// reassignment (`t.a = 1`), and a token no rule of the body read (`!`).
const DEFINE_STATEMENT_STARTS = nodeNameSet([
  "LuauAccessPath", "LuauNumericDecimal", "LuauNumericHex", "LuauNumericBinary",
  "LuauDoubleQuotedString", "LuauSingleQuotedString", "LuauMultilineString",
  "LuauInterpolatedString", "LuauBoolean", "LuauNil", "LuauTable",
  "LuauLengthOperation", "LuauLogicalOperation", "LuauParenthetical", "LuauUnitKeywords",
]);

const DEFINE_CONTENT = "LuauDefine_content";

/**
 * Whether a child of a define's content begins a statement of the body: an
 * expression or reassignment, an unread token, a function definition with
 * no name, or a `name(...)` line the grammar opened as a method that is a
 * call (`isDefineMethodCall`), which holds its whole line.
 */
export function isDefineStatementStart(child: SyntaxNode, lineOf: (pos: number) => number): boolean {
  if (child.name === "LuauFunctionDefinition") return !findOwnDeclarationName(child);
  if (child.name === "LuauMethodDefinition") return isDefineMethodCall(child, lineOf);
  return DEFINE_STATEMENT_STARTS.has(child.name) || REASSIGNMENT_NAMES.has(child.name) || UNREAD_TOKENS.has(child.name);
}

/**
 * Whether the reading reads the statement a start begins, or leaves it to
 * the tree checks: a statement that is a `.` no name follows, or holds one,
 * is the validator's to report (`LuauDanglingAccessor`), and a line that
 * finishes what the statement before it left open (a value after a
 * line-ending `=` or operator, a name after a line-ending `.`) is reported
 * where that statement ends.
 */
export function readsDefineStatement(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  const dangling = start.name === "LuauDanglingAccessor" || getDescendent("LuauDanglingAccessor", start) !== undefined;
  return !dangling && !followsDanglingDot(start, read) && !followsMissingValue(start, read);
}

/**
 * The start of the define body statement a node is in, where the reading
 * reads it (`readsDefineStatement`). A statement begins at the first node of
 * its line, past trivia, and runs to the line's end. Null for a node of a
 * member, of the define's header, of a line that a member or a line
 * continuation begins, and outside a define's content.
 */
export function loweredDefineStatementOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  let top = node;
  while (top?.parent && top.parent.name !== DEFINE_CONTENT) top = top.parent;
  if (!top?.parent) return null;
  let start = top;
  for (let prev = top.prevSibling; prev && prev.name !== "Newline"; prev = prev.prevSibling) start = prev;
  while (start !== top && TRIVIA_BEFORE_STATEMENT.has(start.name)) start = start.nextSibling!;
  // Lines are counted from the start, the only line a method call compares.
  const lineOf = (pos: number) => (pos <= start.from ? 0 : read(start.from, pos).split("\n").length - 1);
  if (!isDefineStatementStart(start, lineOf)) return null;
  return readsDefineStatement(start, read) ? start : null;
}
