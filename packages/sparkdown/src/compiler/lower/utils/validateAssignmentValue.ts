import { lineBreakValues } from "./assignmentLineBreak";
import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, type SourceMetadata } from "../../../runtime/Error";
import type { LowerContext } from "../context";
import { commaLineBreakValue, isListCommaName } from "../../utils/listCommaNames";
import { REASSIGNMENT_NAMES, reassignmentParts } from "../../utils/reassignmentNames";
import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import {
  VARIABLE_DEFINITION_BEGIN_NAMES,
  VARIABLE_DEFINITION_END_NAMES,
  VARIABLE_DEFINITION_NAMES,
  ownAssignmentOperation,
} from "../../utils/variableDefinitionNames";
import { checkerReadsOnTo, loweredLuauBodyOf, luauReadingReportsAllAt, readingCarriesOnTo } from "../../typecheck/LuauUnitNodes";
import { AstExprBinary, AstExprCall, AstExprError, AstExprIndexExpr, AstExprIndexName, AstExprUnary } from "../../typecheck/Ast";
import { isLuauNameAt, luauPositionOffset, nextLuauToken, readLuauExpressionAfter } from "../../typecheck/readLuauAst";
import { offsetAt, readExpressionAst } from "./luauAst";
import { commaBeforeStatement, typeOperatorLineValue } from "./lineContinuation";
import { isUnreadTokenAt } from "../../utils/unreadTokens";
import { LUAU_STATEMENT_KEYWORDS } from "../../utils/luauStatementKeywords";
import { enclosingUnclosedIslandEnd, storyIslandEnd, unclosedIslandEnd } from "../../utils/storyIslands";

const COMMENT_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
  "LuauTypeTrailingBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
  "LuauTypeTrailingBlockCommentClose",
  "LuauComment",
]);

function isInsignificant(name: string): boolean {
  return (
    name === "OptionalWhitespace" ||
    name === "Whitespace" ||
    name === "ExtraWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "Newline" ||
    COMMENT_NAMES.has(name)
  );
}

export function validateStatementNode(
  node: SyntaxNode,
  continuation: readonly SyntaxNode[],
  ctx: LowerContext,
): void {
  const text = ctx.documentText?.();
  if (text !== undefined && (unclosedIslandEnd(node, text) ?? enclosingUnclosedIslandEnd(node, text)) !== undefined) return;
  if (REASSIGNMENT_NAMES.has(node.name)) {
    const parts = reassignmentParts(node);
    const isOperation = (part: SyntaxNode) => isExplicitRuleName(part.name, "LuauAssignmentOperation");
    let rest = continuation;
    while (!parts.some(isOperation)) {
      const at = rest.findIndex((n) => !isInsignificant(n.name));
      const next = at < 0 ? undefined : rest[at];
      if (!next) break;
      parts.push(...rest.slice(0, at), ...(REASSIGNMENT_NAMES.has(next.name) ? reassignmentParts(next) : [next]));
      rest = rest.slice(at + 1);
    }
    validateReassignmentList(parts, rest, ctx);
    const op = parts.find(isOperation);
    if (op) validateAssignmentValue(op, ctx);
    return;
  }
  if (VARIABLE_DEFINITION_NAMES.has(node.name)) {
    validateVariableDefinition(node, continuation, ctx);
    return;
  }
  if (node.name === "LuauSparkdownExplicitStatement" || node.name === "LuauSparkdownExplicitBlockStatement") {
    const declaration = getDescendent(["LuauSparkdownVariableDefinition"], node);
    if (declaration) {
      validateVariableDefinition(declaration, continuation, ctx);
      return;
    }
    const content = node.getChild(`${node.name}_content`);
    if (content) validateReassignmentList(childrenOf(content), continuation, ctx);
    return;
  }
  const op = siblingAssignmentOperation(node);
  if (op) validateAssignmentValue(op, ctx);
}

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}

const STORE_LINK_NAMES = nodeNameSet([
  "LuauParenthetical",
  "LuauChainedFunctionCall",
  "LuauChainedPropertyAccess",
]);

const SIBLING_BRIDGE: ReadonlySet<string> = nodeNameSet([
  "Newline",
  "ExtraWhitespace",
  "LuauComment",
  "LuauBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
]);

function siblingAssignmentOperation(node: SyntaxNode): SyntaxNode | null {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (SIBLING_BRIDGE.has(next.name) || STORE_LINK_NAMES.has(next.name)) {
      continue;
    }
    return isExplicitRuleName(next.name, "LuauAssignmentOperation") ? next : null;
  }
  return null;
}

function luauReadingReportsUnread(node: SyntaxNode, offset: number, read: (from: number, to: number) => string): boolean {
  if (!isUnreadTokenAt(node, offset)) return false;
  return checkerReadsOnTo(node, offset, read) || loweredLuauBodyOf(node) !== null;
}

export function validateAssignmentValue(
  opNode: SyntaxNode,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  const operator = getDescendent("LuauAssignmentOperator", opNode);
  if (!operator) return;
  for (let sib = operator.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.name === "LuauAssignmentLineBreak" ? lineBreakValues(sib).length > 0 : !isInsignificant(sib.name)) return;
  }
  const range = operatorTokenRange(operator, ctx);
  const read = (from: number, to: number) => ctx.read(from, to);
  if (enclosingUnclosedIslandEnd(opNode, wholeDocument(opNode, read, ctx.documentText)) !== undefined) return;
  const islandEnd = authoredIslandEnd(opNode, wholeDocument(opNode, read, ctx.documentText));
  const next = nextSignificantToken(opNode, operator.to, read, ctx.documentText, islandEnd);
  if (next && luauReadingReportsUnread(opNode, next.from, read)) return;
  if (checkerReadsOnTo(opNode, next?.from, read)) {
    const value = readLuauExpressionAfter(operator.to, wholeDocument(opNode, read, ctx.documentText), islandEnd);
    if (value.errors.every((error) => error.message.startsWith("Expected the end of the expression"))) return;
  }
  if (typeCheckerReportsMissingValue(opNode, operator.to, read, ctx.documentText)) return;
  const got = nextTokenAfter(opNode, range.to, ctx);
  const atKeyword =
    got !== null &&
    LUAU_STATEMENT_KEYWORDS.has(got.text) &&
    ctx.lineNumber(got.from) > ctx.lineNumber(range.to) &&
    !checkerReadsOnTo(opNode, got.from, read);
  ctx.diagnostics.push({
    message: `Expected identifier when parsing expression, got ${display(got)}`,
    severity: ErrorType.Error,
    source: makeSource(atKeyword ? { from: got.from, to: got.from + got.text.length } : range, ctx),
  });
}

export function validateListComma(
  comma: SyntaxNode,
  afterAssignment: boolean,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  const text = ctx.read(comma.from, comma.to);
  const at = comma.from + text.length - text.trimStart().length;
  if (afterAssignment && typeCheckerReportsMissingValue(comma, at + 1, (from, to) => ctx.read(from, to), ctx.documentText)) {
    return;
  }
  const read = (from: number, to: number) => ctx.read(from, to);
  const after = nextSignificantToken(comma, at + 1, read, ctx.documentText, authoredIslandEnd(comma, wholeDocument(comma, read, ctx.documentText)));
  if (after && luauReadingReportsUnread(comma, after.from, read)) return;
  if (!afterAssignment && after && isLuauNameAt(after.from, wholeDocument(comma, read, ctx.documentText)) && readingCarriesOnTo(comma, after.from, read)) return;
  if (!afterAssignment && after && luauReadingReportsAllAt(comma, read) && checkerReadsOnTo(comma, after.from, read)) return;
  const got = nextTokenAfter(comma, at + 1, ctx);
  const parsing = afterAssignment ? "expression" : "variable name";
  ctx.diagnostics.push({
    message: `Expected identifier when parsing ${parsing}, got ${display(got)}`,
    severity: ErrorType.Error,
    source: makeSource({ from: at, to: at + 1 }, ctx),
  });
}

export function validateSecondAssignment(
  opNode: SyntaxNode,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  const operator = getDescendent("LuauAssignmentOperator", opNode);
  if (!operator) return;
  const range = operatorTokenRange(operator, ctx);
  const got = ctx.read(range.from, range.to);
  ctx.diagnostics.push({
    message: `Expected identifier when parsing expression, got '${got}'`,
    severity: ErrorType.Error,
    source: makeSource(range, ctx),
  });
}

export function validateReassignmentList(
  parts: readonly SyntaxNode[],
  continuation: readonly SyntaxNode[],
  ctx: LowerContext,
): void {
  let sawAssignment = false;
  let compound = false;
  let onlyTargets = true;
  let sawTargetComma = false;
  let last: SyntaxNode | null = null;
  for (const child of parts) {
    if (isInsignificant(child.name)) continue;
    if (!sawAssignment && !isExplicitRuleName(child.name, "LuauAssignmentOperation")) {
      if (isListCommaName(child.name)) sawTargetComma = true;
      else if (!isExplicitRuleName(child.name, "LuauAccessPath") && child.name !== "LuauVariable") onlyTargets = false;
    }
    if (isExplicitRuleName(child.name, "LuauAssignmentOperation")) {
      if (sawAssignment) {
        validateSecondAssignment(child, ctx);
        return;
      }
      sawAssignment = true;
      const operator = getDescendent("LuauAssignmentOperator", child);
      const range = operator && operatorTokenRange(operator, ctx);
      const opText = range ? ctx.read(range.from, range.to) : "=";
      compound = opText !== "=";
      if (compound && sawTargetComma && range) {
        reportParseError(`Expected '=' when parsing assignment, got '${opText}'`, range, ctx);
        return;
      }
    } else if (compound && isListCommaName(child.name)) {
      const text = ctx.read(child.from, child.to);
      const at = child.from + text.length - text.trimStart().length;
      if (typeCheckerReportsMissingValue(child, at, (from, to) => ctx.read(from, to), ctx.documentText)) return;
      reportParseError(
        "Expected identifier when parsing expression, got ','",
        { from: at, to: at + 1 },
        ctx,
      );
      return;
    } else if (
      sawAssignment &&
      last &&
      isListCommaName(last.name) &&
      cannotBeginValue(child, ctx)
    ) {
      validateListComma(last, true, ctx);
      return;
    }
    last = commaLineBreakValue(child) ?? child;
  }
  if (!sawAssignment) {
    if (!onlyTargets || !sawTargetComma || !last) return;
    if (isListCommaName(last.name)) {
      validateListComma(last, true, ctx);
      return;
    }
    const got = nextTokenAfter(last, last.to, ctx);
    const at = got?.from ?? last.to;
    reportParseError(
      `Expected '=' when parsing assignment, got ${display(got)}`,
      { from: at, to: at + (got?.text.length ?? 0) },
      ctx,
    );
    return;
  }
  const beforeStatement = commaBeforeStatement([last, ...continuation], ctx);
  if (beforeStatement) {
    validateListComma(beforeStatement, true, ctx);
    return;
  }
  const lastContinued = continuation.findLast((n) => !isInsignificant(n.name));
  if (lastContinued?.name === "LuauCommaSeparator") {
    validateListComma(lastContinued, true, ctx);
  } else if (!lastContinued && isListCommaName(last?.name)) {
    validateListComma(last!, true, ctx);
  }
}

function isDeclarationTrivia(name: string): boolean {
  return (
    isInsignificant(name) ||
    VARIABLE_DEFINITION_BEGIN_NAMES.has(name) ||
    VARIABLE_DEFINITION_END_NAMES.has(name)
  );
}

export function validateVariableDefinition(
  node: SyntaxNode,
  continuation: readonly SyntaxNode[],
  ctx: LowerContext,
): void {
  const content = node.getChild(`${node.name}_content`);
  let sawAssignmentOp = false;
  let hasValueGroup = false;
  let trailingStatements = 0;
  let lastTarget: SyntaxNode | null = null;
  let unresolvedComma: SyntaxNode | null = null;
  let unresolvedAfterAssignment = false;
  let previous: SyntaxNode | null = null;
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (isDeclarationTrivia(child.name)) continue;
    const pendingComma = unresolvedComma;
    unresolvedComma = null;
    const before = previous;
    previous = child;
    if (isExplicitRuleName(child.name, "LuauVariableAssignment")) {
      const opNode = ownAssignmentOperation(child);
      if (sawAssignmentOp) {
        if (opNode) validateSecondAssignment(opNode, ctx);
        else hasValueGroup = true;
        continue;
      }
      if (getDescendent("LuauVariableName", child)) lastTarget = child;
      if (opNode) sawAssignmentOp = true;
      continue;
    }
    if (isListCommaName(child.name)) {
      const value = sawAssignmentOp ? commaLineBreakValue(child) : null;
      if (value) {
        hasValueGroup = true;
      } else {
        unresolvedComma = child;
        unresolvedAfterAssignment = sawAssignmentOp;
      }
      continue;
    }
    if (isExplicitRuleName(child.name, "LuauAccessPath") && !sawAssignmentOp && !hasValueGroup) {
      lastTarget = child;
      continue;
    }
    if (
      child.name === "LuauFunctionDefinition" &&
      sawAssignmentOp &&
      isListCommaName(before?.name)
    ) {
      hasValueGroup = true;
      continue;
    }
    if (TRAILING_STATEMENT_NAMES.has(child.name)) {
      if (pendingComma && child.name !== "LuauFunctionDefinition") {
        validateListComma(pendingComma, unresolvedAfterAssignment, ctx);
      }
      trailingStatements++;
      continue;
    }
    if (pendingComma && unresolvedAfterAssignment && cannotBeginValue(child, ctx)) {
      validateListComma(pendingComma, true, ctx);
    }
    hasValueGroup = true;
  }

  const lastContinued = continuation.findLast((n) => !isDeclarationTrivia(n.name));
  const valuesAfterComma =
    unresolvedComma != null &&
    unresolvedAfterAssignment &&
    trailingStatements === 0 &&
    lastContinued != null;
  const beforeStatement =
    sawAssignmentOp &&
    commaBeforeStatement([unresolvedComma ?? previous, ...continuation], ctx);
  if (beforeStatement) {
    validateListComma(beforeStatement, true, ctx);
  } else if (lastContinued?.name === "LuauCommaSeparator") {
    validateListComma(lastContinued, true, ctx);
  } else if (unresolvedComma && !valuesAfterComma) {
    validateListComma(unresolvedComma, unresolvedAfterAssignment, ctx);
  }
  if (!lastTarget) return;

  let firstOp =
    isExplicitRuleName(lastTarget.name, "LuauVariableAssignment")
      ? ownAssignmentOperation(lastTarget)
      : null;
  if (!firstOp && trailingStatements === 0 && !valuesAfterComma) {
    for (const n of continuation) {
      if (n.name === "LuauCommaSeparator") break;
      if (isExplicitRuleName(n.name, "LuauAssignmentOperation")) {
        firstOp = n;
        break;
      }
    }
  }
  if (!firstOp && !sawAssignmentOp) firstOp = typeOperatorLineValue(node);
  if (firstOp) validateAssignmentValue(firstOp, ctx);
}

export function cannotBeginValue(node: SyntaxNode, ctx: LowerContext): boolean {
  const reading = readExpressionAst([node], ctx);
  if (!reading || !(reading.expr instanceof AstExprError)) return false;
  const error = reading.source.errors[0];
  if (!error?.message.startsWith("Expected identifier when parsing expression")) {
    return false;
  }
  const text = ctx.read(node.from, node.to);
  const first = node.from + text.length - text.trimStart().length;
  return offsetAt(error.location.begin, ctx) === first;
}

function nextTokenAfter(
  anyNode: SyntaxNode,
  pos: number,
  ctx: LowerContext,
): { text: string; from: number } | null {
  const islandEnd = authoredIslandEnd(anyNode, wholeDocument(anyNode, (from, to) => ctx.read(from, to), ctx.documentText));
  let top = anyNode;
  while (top.parent) top = top.parent;
  let node: SyntaxNode | null = top.resolveInner(pos, 1);
  while (node) {
    const token = firstTokenIn(node, pos, ctx);
    if (token && islandEnd !== undefined && token.from >= islandEnd) return null;
    if (token) {
      if (token.text !== "-" || ctx.read(token.from, token.from + 2) !== "--") {
        return token;
      }
      const bracket = longBracketAt(top, token.from + 2, ctx);
      if (bracket) {
        pos = bracket.to;
      } else {
        const lineEnd = newlineAfter(top, token.from);
        if (!lineEnd) return null;
        pos = lineEnd.to;
      }
      node = top.resolveInner(pos, 1);
      continue;
    }
    while (node && !node.nextSibling) node = node.parent;
    node = node?.nextSibling ?? null;
  }
  return null;
}

function longBracketAt(
  top: SyntaxNode,
  pos: number,
  ctx: LowerContext,
): SyntaxNode | null {
  const open = ctx.read(pos, pos + 2);
  if (open !== "[[" && open !== "[=") return null;
  let node: SyntaxNode | null = top.resolveInner(pos, 1);
  if (!node || node.from !== pos) return null;
  while (node.parent && node.parent.from === pos && node.parent !== top) {
    node = node.parent;
  }
  return node;
}

function newlineAfter(top: SyntaxNode, pos: number): SyntaxNode | null {
  const cursor = top.cursor();
  cursor.moveTo(pos, 1);
  do {
    if (cursor.name === "Newline" && cursor.from >= pos) return cursor.node;
  } while (cursor.next());
  return null;
}

function firstTokenIn(
  node: SyntaxNode,
  pos: number,
  ctx: LowerContext,
): { text: string; from: number } | null {
  if (node.to <= pos || isInsignificant(node.name)) return null;
  let at = Math.max(node.from, pos);
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > at) {
      const token = tokenAt(ctx.read(at, child.from), at);
      if (token) return token;
    }
    const token = firstTokenIn(child, pos, ctx);
    if (token) return token;
    at = Math.max(at, child.to);
  }
  return node.to > at ? tokenAt(ctx.read(at, node.to), at) : null;
}

function isNameStart(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95
  );
}

function isNameChar(code: number): boolean {
  return isNameStart(code) || (code >= 48 && code <= 57);
}

function tokenAt(
  text: string,
  from: number,
): { text: string; from: number } | null {
  const trimmed = text.trimStart();
  if (!trimmed) return null;
  const start = from + text.length - trimmed.length;
  if (!isNameStart(trimmed.charCodeAt(0))) {
    return { text: String.fromCodePoint(trimmed.codePointAt(0)!), from: start };
  }
  let end = 1;
  while (end < trimmed.length && isNameChar(trimmed.charCodeAt(end))) end++;
  return { text: trimmed.slice(0, end), from: start };
}

function display(got: { text: string } | null): string {
  return got == null ? "<eof>" : `'${got.text}'`;
}

export function typeCheckerReportsMissingValue(
  node: SyntaxNode,
  pos: number,
  read: (from: number, to: number) => string,
  document?: () => string,
): boolean {
  const text = wholeDocument(node, read, document);
  const authoredEnd = authoredIslandEnd(node, text);
  const reading = readLuauExpressionAfter(pos, text, authoredEnd);
  let expr = reading.expr;
  for (;;) {
    if (expr instanceof AstExprUnary) expr = expr.expr;
    else if (expr instanceof AstExprBinary) expr = expr.left;
    else if (expr instanceof AstExprCall) expr = expr.func;
    else if (expr instanceof AstExprIndexName || expr instanceof AstExprIndexExpr) expr = expr.expr;
    else break;
  }
  if (!(expr instanceof AstExprError) || expr.expressions.length > 0) return false;
  const error = reading.errors[expr.messageIndex];
  if (!error?.message.startsWith("Expected identifier when parsing expression")) return false;
  const at = luauPositionOffset(error.location.begin, text);
  const got = nextLuauToken(at, text, authoredEnd);
  if ((got?.text === ":" || got?.text === "@") && !luauReadingReportsAllAt(node, read)) return false;
  return checkerReadsOnTo(node, got?.from, read);
}

export function authoredIslandEnd(node: SyntaxNode, text: string): number | undefined {
  return storyIslandEnd(node, text);
}

function wholeDocument(node: SyntaxNode, read: (from: number, to: number) => string, document?: () => string): string {
  if (document) return document();
  while (node.parent) node = node.parent;
  return read(0, node.to);
}

export function nextSignificantToken(
  node: SyntaxNode,
  pos: number,
  read: (from: number, to: number) => string,
  document?: () => string,
  to?: number,
): { text: string; from: number } | null {
  return nextLuauToken(pos, wholeDocument(node, read, document), to);
}

function operatorTokenRange(
  operator: SyntaxNode,
  ctx: LowerContext,
): { from: number; to: number } {
  const begin = operator.firstChild?.name === `${operator.name}_begin` ? operator.firstChild : operator;
  const text = ctx.read(begin.from, begin.to);
  const leading = text.length - text.trimStart().length;
  const trailing = text.length - text.trimEnd().length;
  const from = begin.from + leading;
  const to = begin.to - trailing;
  return to > from ? { from, to } : { from: begin.from, to: begin.to };
}

function reportParseError(
  message: string,
  range: { from: number; to: number },
  ctx: LowerContext,
): void {
  ctx.diagnostics?.push({
    message,
    severity: ErrorType.Error,
    source: makeSource(range, ctx),
  });
}

function makeSource(
  range: { from: number; to: number },
  ctx: LowerContext,
): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(range.from) + 1,
    endLineNumber: ctx.lineNumber(range.to) + 1,
    startCharacterNumber: ctx.characterNumber(range.from) + 1,
    endCharacterNumber: ctx.characterNumber(range.to) + 1,
  };
}
