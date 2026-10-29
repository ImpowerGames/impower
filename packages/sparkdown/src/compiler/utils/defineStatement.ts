import type { SyntaxNode } from "@lezer/common";
import { lineBreakValues } from "../lower/utils/assignmentLineBreak";
import { findOwnDeclarationName } from "../lower/utils/findOwnDeclarationName";
import { isLineContinuation } from "../lower/utils/significantLeaf";
import { followsDanglingDot, followsMissingValue, TRIVIA_BEFORE_STATEMENT } from "../lower/utils/statementBefore";
import { isDefineMethodCall } from "./defineMethodCall";
import { nodeNameSet } from "./nodeNameSet";
import { REASSIGNMENT_NAMES } from "./reassignmentNames";
import { UNREAD_TOKENS } from "./unreadTokens";

const DEFINE_STATEMENT_STARTS = nodeNameSet([
  "LuauAccessPath", "LuauNumericDecimal", "LuauNumericHex", "LuauNumericBinary",
  "LuauDoubleQuotedString", "LuauSingleQuotedString", "LuauMultilineString",
  "LuauInterpolatedString", "LuauBoolean", "LuauNil", "LuauTable",
  "LuauLengthOperation", "LuauLogicalOperation", "LuauParenthetical", "LuauUnitKeywords",
]);

const DEFINE_CONTENT = "LuauDefine_content";

export const DEFINE_MEMBERS = nodeNameSet(["LuauPropertyDefinition", "LuauMethodDefinition", "LuauFunctionDefinition"]);

function isAnonymousFunction(node: SyntaxNode): boolean {
  return node.name === "LuauFunctionDefinition" && !findOwnDeclarationName(node);
}

export function isDefineMember(child: SyntaxNode): boolean {
  return DEFINE_MEMBERS.has(child.name) && !isAnonymousFunction(child);
}

export function isDefineStatementStart(child: SyntaxNode, lineOf: (pos: number) => number): boolean {
  if (child.name === "LuauFunctionDefinition") return isAnonymousFunction(child);
  if (child.name === "LuauMethodDefinition") return isDefineMethodCall(child, lineOf);
  return DEFINE_STATEMENT_STARTS.has(child.name) || REASSIGNMENT_NAMES.has(child.name) || UNREAD_TOKENS.has(child.name);
}

export function readsDefineStatement(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return !finishesReadLine(start, read);
}

function finishesLineBefore(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  return followsDanglingDot(start, read) || followsMissingValue(start, read);
}

function finishesReadLine(start: SyntaxNode, read: (from: number, to: number) => string): boolean {
  if (!finishesLineBefore(start, read)) return false;
  let prev = start.prevSibling;
  while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
  const define = start.parent?.name === DEFINE_CONTENT ? start.parent.parent : null;
  return !prev || !define || read(define.from, prev.from).includes("\n");
}

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

export function loweredDefineStatementOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  const start = defineReadingOf(node, read);
  return start && start.name !== "LuauPropertyDefinition" ? start : null;
}

export function loweredDefinePropertyOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  const start = defineReadingOf(node, read);
  return start?.name === "LuauPropertyDefinition" && readsDefineProperty(start) ? start : null;
}

export function readsDefineProperty(property: SyntaxNode): boolean {
  const cursor = property.cursor();
  let operator: SyntaxNode | null = null;
  do {
    if (cursor.name === "LuauAssignmentOperator") {
      operator = cursor.node;
      break;
    }
    if (cursor.name === "LuauBracketKeyAssignment" || cursor.name === "LuauDefineKeywordKey" || cursor.name === "LuauAccessModifier") return false;
  } while (cursor.next() && cursor.from < property.to);
  let lineBreak = false;
  for (let next = operator?.nextSibling ?? null; next; next = next.nextSibling) {
    if (!PROPERTY_VALUE_TRIVIA.has(next.name) && !next.name.endsWith("Comment")) return true;
    if (next.name === "LuauAssignmentLineBreak") {
      if (lineBreakValues(next).length > 0) return true;
      lineBreak = true;
    }
  }
  if (!lineBreak) return false;
  for (let next = property.nextSibling; next && !isDefineMember(next); next = next.nextSibling) {
    if (!PROPERTY_VALUE_TRIVIA.has(next.name) && !next.name.endsWith("Comment")) return true;
  }
  return false;
}

const PROPERTY_VALUE_TRIVIA = nodeNameSet([
  "ExtraWhitespace", "Whitespace", "OptionalWhitespace", "RequiredWhitespace", "Newline", "LuauAssignmentLineBreak",
]);

function defineReadingOf(node: SyntaxNode | null, read: (from: number, to: number) => string): SyntaxNode | null {
  let top = node;
  while (top?.parent && top.parent.name !== DEFINE_CONTENT) {
    if (top.name === "LuauDanglingAccessor") return null;
    top = top.parent;
  }
  if (!top?.parent) return null;
  const define = top.parent.parent;
  const onHeader = (n: SyntaxNode) => !!define && !read(define.from, n.from).includes("\n");
  if (onHeader(top)) return null;
  let start = lineFirst(top);
  if (onHeader(start)) {
    let next: SyntaxNode | null = start;
    while (next && next.from <= top.from && (onHeader(next) || !isDefineStatementStart(next, lineCounter(next, read)))) {
      next = next.nextSibling;
    }
    if (!next || next.from > top.from) return null;
    start = next;
  }
  if (start.name === "LuauPropertyDefinition" && !read(start.from, top.from).includes("\n")) {
    const after = top === start ? null : statementAfterProperty(start, top);
    if (!after) return start;
    start = after;
  }
  while (isLineContinuation(start) || finishesReadLine(start, read)) {
    let prev = start.prevSibling;
    while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
    if (!prev) return null;
    start = lineFirst(prev);
    if (onHeader(start)) return null;
  }
  if (start.name === "LuauPropertyDefinition") {
    const after = statementAfterProperty(start, top);
    if (!after) return start;
    start = after;
  }
  if (!isDefineStatementStart(start, lineCounter(start, read))) return null;
  return readsDefineStatement(start, read) ? start : null;
}

function lineCounter(from: SyntaxNode, read: (from: number, to: number) => string): (pos: number) => number {
  // value-level: the text between two offsets, its line breaks counted.
  return (pos) => (pos <= from.from ? 0 : read(from.from, pos).split("\n").length - 1);
}

function lineFirst(node: SyntaxNode): SyntaxNode {
  let first = node;
  for (let prev = node.prevSibling; prev && prev.name !== "Newline"; prev = prev.prevSibling) first = prev;
  while (first !== node && TRIVIA_BEFORE_STATEMENT.has(first.name)) first = first.nextSibling!;
  return first;
}

function lineLast(node: SyntaxNode): SyntaxNode {
  let last = node;
  for (let next: SyntaxNode | null = node; next && next.name !== "Newline"; next = next.nextSibling) last = next;
  return last;
}
