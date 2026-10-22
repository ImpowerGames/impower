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
 * when a member left it open. A line that finishes the define's header line
 * is read as its own (`define X with there.` then `t.f(1 2 3)`): no reading
 * reads the header.
 */
export function readsDefineStatement(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return !finishesReadLine(start, read);
}

/** Whether a line's first node finishes what the line before it left open. */
function finishesLineBefore(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return followsDanglingDot(start, read) || followsMissingValue(start, read);
}

/** Whether a line's first node finishes what a line before it, not the define's header, left open. */
function finishesReadLine(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  if (!finishesLineBefore(start, read)) return false;
  let prev = start.prevSibling;
  while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
  const define = start.parent?.name === DEFINE_CONTENT ? start.parent.parent : null;
  return !prev || !define || read(define.from, prev.from).includes("\n");
}

/** The first node after a property on its line that begins a statement, up to `top`, or null. */
function statementAfterProperty(property: SyntaxNode, top: SyntaxNode): SyntaxNode | null {
  let next = property.nextSibling;
  while (
    next &&
    next.name !== "Newline" &&
    next.from <= top.from &&
    !DEFINE_STATEMENT_STARTS.has(next.name) &&
    !REASSIGNMENT_NAMES.has(next.name)
  ) {
    next = next.nextSibling;
  }
  return !next || next.name === "Newline" || next.from > top.from ? null : next;
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
 * continue it, and each next line that finishes what the line before it
 * left open (`readsDefineStatement`), whether or not Luau takes its first
 * token (`there.` then `1 + 2; t.f(1 +)`): no reading of its own reads it.
 * A line a member begins is the member's and ends them. `last` when the
 * reading ends on the statement's own lines.
 */
export function defineStatementThrough(
  last: SyntaxNode,
  to: number,
  read: (from: number, to: number) => string,
  lineOf: (pos: number) => number,
): SyntaxNode {
  for (;;) {
    let next = last.nextSibling;
    while (next && TRIVIA_BEFORE_STATEMENT.has(next.name)) next = next.nextSibling;
    if (!next || !isDefineStatementStart(next, lineOf)) return last;
    if (next.from >= to && !finishesLineBefore(next, read)) return last;
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
 * member (a property's is its own reading's, `loweredDefinePropertyOf`),
 * of the define's header, of a line that another member begins or
 * that continues one, of a `.` no name follows (`danglingDots`), whose own
 * error the validator reports, of the define's header line, and outside a
 * define's content. A define's structure errors change nothing: its lowerer
 * reads the body of every define (`lowerLuauDefine`).
 */
export function loweredDefineStatementOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  const start = defineReadingOf(node, read);
  return start && start.name !== "LuauPropertyDefinition" ? start : null;
}

/**
 * The define body property a node is in, or whose line it finishes before
 * a statement begins on it, or null: the property's reading reports every
 * Luau error of its key and value, in Luau's words at Luau's range, once
 * (`readPropertyDefinition`, I-1500), so the tree checks leave them to it
 * (`checkerReadsOnTo`). A `.` no name follows keeps the validator's error,
 * and a property on the define's header line is the header's.
 */
export function loweredDefinePropertyOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  const start = defineReadingOf(node, read);
  return start?.name === "LuauPropertyDefinition" && readsDefineProperty(start) ? start : null;
}

/**
 * Whether the lowerer reads a define body's property as Luau's statement
 * `name = value` (`reportDefineProperty`, I-1500): a property keyed by a
 * name. A bracket key (`["$link"] = …`), a key spelled as a reserved word
 * and one with an access modifier are Sparkdown's syntax, which begins no
 * Luau statement; such a property keeps its own reading's reports.
 */
export function readsDefineProperty(property: SyntaxNode): boolean {
  const cursor = property.cursor();
  let operator: SyntaxNode | null = null;
  do {
    // The key is before the `=`.
    if (cursor.name === "LuauAssignmentOperator") {
      operator = cursor.node;
      break;
    }
    if (cursor.name === "LuauBracketKeyAssignment" || cursor.name === "LuauDefineKeywordKey" || cursor.name === "LuauAccessModifier") return false;
  } while (cursor.next() && cursor.from < property.to);
  // A property with no value on its line (`name =`) keeps the missing
  // value's report (`validateAssignmentValue`).
  for (let next = operator?.nextSibling ?? null; next; next = next.nextSibling) {
    if (!PROPERTY_VALUE_TRIVIA.has(next.name) && !next.name.endsWith("Comment")) return true;
  }
  return false;
}

// What stands after a property's `=` that is no value.
const PROPERTY_VALUE_TRIVIA = nodeNameSet([
  "ExtraWhitespace", "Whitespace", "OptionalWhitespace", "RequiredWhitespace", "Newline", "LuauAssignmentLineBreak",
]);

/** The statement start or property whose reading reads a define body node (`loweredDefineStatementOf`, `loweredDefinePropertyOf`). */
function defineReadingOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  let top = node;
  while (top?.parent && top.parent.name !== DEFINE_CONTENT) {
    if (top.name === "LuauDanglingAccessor") return null;
    top = top.parent;
  }
  if (!top?.parent) return null;
  // What starts on the define's header line is the header's, which the
  // lowerer never reads (`lowerLuauDefine`).
  const define = top.parent.parent;
  const onHeader = (n: SyntaxNode) => !!define && !read(define.from, n.from).includes("\n");
  if (onHeader(top)) return null;
  let start = lineFirst(top);
  // A node of the header that runs on into this line (`define X with t.a =
  // 1 +` then `1 + 2; t.f(1 +)`) is the header's; the lowerer reads the
  // first statement after it.
  if (onHeader(start)) {
    let next: SyntaxNode | null = start;
    while (next && next.from <= top.from && (onHeader(next) || !isDefineStatementStart(next, lineCounter(next, read)))) {
      next = next.nextSibling;
    }
    if (!next || next.from > top.from) return null;
    start = next;
  }
  // After a property on its line, a statement begins at the next node that
  // begins one (`y = 1; t.f(2 +)`), as the lowerer reads it past the value,
  // whatever the line the property finishes.
  // The property's own nodes, and those of its line before a statement
  // begins, are its reading's, which reports every error of its key and
  // value (`readPropertyDefinition`, I-1500).
  if (start.name === "LuauPropertyDefinition" && !read(start.from, top.from).includes("\n")) {
    const after = top === start ? null : statementAfterProperty(start, top);
    if (!after) return start;
    start = after;
  }
  // A line that continues the line before, or finishes what a statement
  // line before it left open, is read with that line's statement. A
  // continuation of the header's line is the header's, which no reading
  // reads.
  while (isLineContinuation(start) || finishesReadLine(start, read)) {
    let prev = start.prevSibling;
    while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
    if (!prev) return null;
    start = lineFirst(prev);
    if (onHeader(start)) return null;
  }
  // A line that finishes what a property left open is its reading's.
  if (start.name === "LuauPropertyDefinition") {
    const after = statementAfterProperty(start, top);
    if (!after) return start;
    start = after;
  }
  if (!isDefineStatementStart(start, lineCounter(start, read))) return null;
  return readsDefineStatement(start, read) ? start : null;
}

/** Lines counted from a node, the only line a method call compares. */
function lineCounter(from: SyntaxNode, read: (from: number, to: number) => string): (pos: number) => number {
  // value-level: the text between two offsets, its line breaks counted.
  return (pos) => (pos <= from.from ? 0 : read(from.from, pos).split("\n").length - 1);
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
