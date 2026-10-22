import type { SyntaxNode } from "@lezer/common";
import { findOwnDeclarationName } from "../lower/utils/findOwnDeclarationName";
import { isLineContinuation } from "../lower/utils/significantLeaf";
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
 * Whether the reading reads the statement a start begins as its own: not
 * when the line finishes what the line before it left open (a value after
 * a line-ending `=` or operator, a name after a line-ending `.`), which
 * belongs to the reading of that line's statement, or to the tree checks
 * when a member left it open.
 */
export function readsDefineStatement(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return !finishesLineBefore(start, read);
}

/** Whether a line's first node finishes what the line before it left open. */
function finishesLineBefore(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return followsDanglingDot(start, read) || followsMissingValue(start, read);
}

/**
 * The `.` no name follows in the nodes from `start` to `last`
 * (`LuauDanglingAccessor`). Each one's own error, Luau's `Expected
 * identifier, got …` at the token after it, is the validator's to report,
 * in a define of any structure, and the reading leaves it that one error
 * (`loweredDefineStatementOf` answers null for the `.`).
 */
export function danglingDots(start: SyntaxNode, last: SyntaxNode): SyntaxNode[] {
  const dots: SyntaxNode[] = [];
  for (let node: SyntaxNode | null = start; node; node = node.nextSibling) {
    const cursor = node.cursor();
    do {
      if (cursor.name === "LuauDanglingAccessor") dots.push(cursor.node);
    } while (cursor.next() && cursor.from < node.to);
    if (node === last) break;
  }
  return dots;
}

/**
 * The last node of the define body statement `start` begins: the last node
 * of its line, or the start itself when it holds its whole line (`whole`),
 * and then the last node of each line that continues it
 * (`isLineContinuation`: `.g(2)`, `:g(2)`, `[1]`), which Luau reads as part
 * of it.
 */
export function defineStatementLast(start: SyntaxNode, whole = false): SyntaxNode {
  let last = start;
  if (!whole) last = lineLast(start);
  for (;;) {
    let next = last.nextSibling;
    while (next && TRIVIA_BEFORE_STATEMENT.has(next.name)) next = next.nextSibling;
    if (!next || !isLineContinuation(next)) return last;
    last = lineLast(next);
  }
}

/**
 * The last node of the statement lines Luau's reading of a statement reads
 * on into, before `to`, where that reading ends: each next line that begins
 * a statement (`isDefineStatementStart`), whole, with the lines that
 * continue it. A line a member begins is the member's and ends them. `last`
 * when the reading ends on the statement's own lines.
 */
export function defineStatementThrough(last: SyntaxNode, to: number, lineOf: (pos: number) => number): SyntaxNode {
  for (;;) {
    let next = last.nextSibling;
    while (next && TRIVIA_BEFORE_STATEMENT.has(next.name)) next = next.nextSibling;
    if (!next || next.from >= to || !isDefineStatementStart(next, lineOf)) return last;
    last = defineStatementLast(next, isDefineMethodCall(next, lineOf));
  }
}

/**
 * The start of the define body statement a node is in, where the reading
 * reads it (`readsDefineStatement`). A statement begins at the first node of
 * its line, past trivia, and runs to the line's end and through the lines
 * that continue it (`defineStatementLast`), or, on a line a property begins,
 * at the first node after it that begins a statement. A line the reading
 * of an earlier statement reads on into is read whole with that statement
 * (`defineStatementThrough`); its own start answers for it, since the line
 * is read either way. Null for a node of a
 * member, of the define's header, of a line that another member begins or
 * that continues one, of a `.` no name follows (`danglingDots`), whose own
 * error the validator reports, and outside a define's content.
 */
export function loweredDefineStatementOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  let top = node;
  while (top?.parent && top.parent.name !== DEFINE_CONTENT) {
    if (top.name === "LuauDanglingAccessor") return null;
    top = top.parent;
  }
  if (!top?.parent) return null;
  let start = lineFirst(top);
  // A line that continues the line before, or finishes what it left open,
  // is read with that line's statement.
  while (isLineContinuation(start) || finishesLineBefore(start, read)) {
    let prev = start.prevSibling;
    while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
    if (!prev) return null;
    start = lineFirst(prev);
  }
  // After a property on its line, a statement begins at the next node that
  // begins one (`y = 1; t.f(2 +)`), as the lowerer reads it past the value.
  if (start.name === "LuauPropertyDefinition") {
    let next = start.nextSibling;
    while (
      next &&
      next.name !== "Newline" &&
      next.from <= top.from &&
      !DEFINE_STATEMENT_STARTS.has(next.name) &&
      !REASSIGNMENT_NAMES.has(next.name)
    ) {
      next = next.nextSibling;
    }
    if (!next || next.name === "Newline" || next.from > top.from) return null;
    start = next;
  }
  // Lines are counted from the start, the only line a method call compares.
  const first = start;
  const lineOf = (pos: number) => (pos <= first.from ? 0 : read(first.from, pos).split("\n").length - 1);
  if (!isDefineStatementStart(start, lineOf)) return null;
  return readsDefineStatement(start, read) ? start : null;
}

/** The first node of the line a sibling is on, past trivia, or the sibling itself. */
function lineFirst(node: SyntaxNode): SyntaxNode {
  let first = node;
  for (let prev = node.prevSibling; prev && prev.name !== "Newline"; prev = prev.prevSibling) first = prev;
  while (first !== node && TRIVIA_BEFORE_STATEMENT.has(first.name)) first = first.nextSibling!;
  return first;
}

/** The last node of the line a sibling begins, before its line break. */
function lineLast(node: SyntaxNode): SyntaxNode {
  let last = node;
  for (let next: SyntaxNode | null = node; next && next.name !== "Newline"; next = next.nextSibling) last = next;
  return last;
}
