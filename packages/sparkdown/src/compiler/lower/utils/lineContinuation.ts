import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { LowerContext } from "../context";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { BLOCK_NAMES } from "./statementNodeNames";
import {
  VARIABLE_DEFINITION_NAMES,
  ownAssignmentOperation,
} from "../../utils/variableDefinitionNames";
import { REASSIGNMENT_NAMES } from "../../utils/reassignmentNames";
import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import { findOwnDeclarationName } from "./findOwnDeclarationName";
import { CONTINUATION_BRIDGE, LINE_CONTINUATION, SKIPPABLE, isLineContinuation, lastSignificantLeaf } from "./significantLeaf";
import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprError,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprTypeAssertion,
  AstExprUnary,
  AstStat,
  AstStatAssign,
  AstStatCompoundAssign,
  AstStatLocal,
  AstStatReturn,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
  AstStatTypeAlias,
  AstType,
  AstTypeReference,
} from "../../typecheck/Ast";
import type { LuauSyntaxError } from "../../typecheck/readLuauAst";
import { enclosingNode, offsetAt, type LuauSource } from "./luauAst";

export { isLineContinuation };

export function leadingReturnTypeQualifier(
  bodyContent: SyntaxNode,
): { returnType: SyntaxNode; lines: SyntaxNode[] } | null {
  const body =
    bodyContent.name === "LuauFunctionBody_content"
      ? bodyContent.parent
      : bodyContent.name === "LuauFunctionBody"
        ? bodyContent
        : null;
  let returnType: SyntaxNode | null = null;
  for (let n = body?.prevSibling ?? null; n; n = n.prevSibling) {
    if (n.name === "LuauFunctionReturnType") returnType = n;
    if (n.name === "LuauFunctionReturnType" || n.name === "LuauFunctionParameters") break;
  }
  if (!returnType || !endsInTypeName(returnType)) return null;
  const lines: SyntaxNode[] = [];
  let scan = bodyContent.firstChild;
  for (;;) {
    while (scan && CONTINUATION_BRIDGE.has(scan.name)) scan = scan.nextSibling;
    if (!scan || !isLineContinuation(scan)) break;
    while (scan && scan.name !== "Newline") {
      lines.push(scan);
      scan = scan.nextSibling;
    }
  }
  if (!isTypeQualifierContinuation(lines)) return null;
  return { returnType, lines };
}

export function startsWithReturnTypeMembers(
  bodyContent: SyntaxNode,
  first: SyntaxNode | null,
): boolean {
  if (bodyContent.name !== "LuauFunctionBody_content") return false;
  let returnType = false;
  for (let n = bodyContent.parent?.prevSibling ?? null; n; n = n.prevSibling) {
    if (n.name === "LuauFunctionReturnType") returnType = true;
    if (n.name === "LuauFunctionReturnType" || n.name === "LuauFunctionParameters") break;
  }
  let scan = first;
  while (scan && SKIPPABLE.has(scan.name)) scan = scan.nextSibling;
  return returnType && scan?.name === "LuauTypeOperatorLineContinuation";
}

export function typeOperatorLineValue(node: SyntaxNode): SyntaxNode | null {
  if (!endsInTypeAnnotation(node)) return null;
  let value: SyntaxNode | null = null;
  for (let scan = node.nextSibling; scan; scan = scan.nextSibling) {
    if (SKIPPABLE.has(scan.name)) continue;
    if (scan.name !== "LuauTypeOperatorLineContinuation") break;
    for (let part = firstContentChild(scan); part; part = part.nextSibling) {
      if (isExplicitRuleName(part.name, "LuauAssignmentOperation")) value = part;
    }
  }
  return value;
}

function endsInTypeAnnotation(node: SyntaxNode): boolean {
  if (!isExplicitRuleName(node.name, "LuauVariableDefinition")) {
    return false;
  }
  let content: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) content = child;
  }
  let last: SyntaxNode | null = content?.lastChild ?? null;
  while (last && SKIPPABLE.has(last.name)) last = last.prevSibling;
  return (
    last != null && isExplicitRuleName(last.name, "LuauVariableAssignment") &&
    hasDescendant(last, "LuauTypeAnnotationOperation") &&
    !ownAssignmentOperation(last)
  );
}

export function hasTypeOperatorLineOwner(line: SyntaxNode): boolean {
  let prev = line.prevSibling;
  while (prev && SKIPPABLE.has(prev.name)) prev = prev.prevSibling;
  if (!prev) {
    const body = line.parent?.name === "LuauFunctionBody_content" ? line.parent.parent : null;
    for (let n = body?.prevSibling ?? null; n; n = n.prevSibling) {
      if (n.name === "LuauFunctionReturnType") return true;
      if (n.name === "LuauFunctionParameters") return false;
    }
    return false;
  }
  if (prev.name === "LuauTypeOperatorLineContinuation") {
    return !hasDescendant(prev, "LuauAssignmentOperation");
  }
  return (
    isExplicitRuleName(prev.name, "LuauDataTypeDeclaration") ||
    isExplicitRuleName(prev.name, "LuauTypeAnnotationOperation") ||
    endsInTypeAnnotation(prev)
  );
}

export function continuesIntersection(line: SyntaxNode): boolean {
  return hasDescendant(line, "LuauTypeIntersectionLineOperator");
}

export function reportUnownedTypeOperatorLine(line: SyntaxNode, ctx: LowerContext): void {
  const raw = ctx.read(line.from, line.to);
  const text = raw.trim();
  const from = line.from + raw.length - raw.trimStart().length;
  ctx.diagnostics?.push({
    message: `\`${text}\` continues a type, but the line before it does not end in one.`,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(from) + 1,
      endLineNumber: ctx.lineNumber(line.to) + 1,
      startCharacterNumber: ctx.characterNumber(from) + 1,
      endCharacterNumber: ctx.characterNumber(line.to) + 1,
    },
  });
}

export function reportUntakenContinuation(
  line: SyntaxNode,
  previous: AstStat | undefined,
  ctx: LowerContext,
): void {
  const type = trailingType(previous);
  if (type && isTypeQualifierContinuation([line])) {
    const segments = astTypeNameSegments(type);
    if (segments > 0) {
      reportExtraQualifiers(segments, continuationParts([line]), ctx);
      return;
    }
  }
  if (trailingCast(previous)) {
    const parts = continuationParts([line]);
    if (parts.length > 0) {
      reportUntakenLineContinuation(
        parts,
        ctx,
        "To access the value the cast gives, put the cast in parentheses: `(value :: type)`.",
      );
      return;
    }
  }
  reportUntakenLineContinuation([line], ctx);
}

export function continuesInVain(
  line: SyntaxNode,
  errors: readonly LuauSyntaxError[],
  ctx: LowerContext,
): boolean {
  const text = ctx.read(line.from, line.to);
  const first = line.from + text.length - text.trimStart().length;
  if (!errors.some((e) => offsetAt(e.location.begin, ctx) === first)) {
    return false;
  }
  return previousTokenText(line, ctx) !== ",";
}

export function reportValueInVain(
  expr: AstExpr,
  source: LuauSource,
  ctx: LowerContext,
): void {
  let first = expr;
  for (;;) {
    if (first instanceof AstExprIndexName || first instanceof AstExprIndexExpr) {
      first = first.expr;
    } else if (first instanceof AstExprCall) {
      first = first.func;
    } else if (first instanceof AstExprBinary) {
      first = first.left;
    } else if (first instanceof AstExprTypeAssertion) {
      first = first.expr;
    } else {
      break;
    }
  }
  if (!(first instanceof AstExprError)) return;
  const offset = offsetAt(first.location.begin, ctx);
  const line = enclosingNode(source, offset, LINE_CONTINUATION);
  if (!line) return;
  const text = ctx.read(line.from, line.to);
  if (line.from + text.length - text.trimStart().length !== offset) return;
  reportUntakenLineContinuation([line], ctx);
}

function previousTokenText(node: SyntaxNode, ctx: LowerContext): string | null {
  const leaf = previousTokenLeaf(node, ctx);
  return leaf && lastCharacter(leaf, ctx);
}

function previousTokenLeaf(node: SyntaxNode, ctx: LowerContext): SyntaxNode | null {
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    for (let s = n.prevSibling; s; s = s.prevSibling) {
      const leaf = lastTokenLeaf(s, ctx);
      if (leaf) return leaf;
    }
  }
  return null;
}

export function followsLineEndingComma(node: SyntaxNode, ctx: LowerContext): boolean {
  const leaf = previousTokenLeaf(node, ctx);
  return (
    leaf != null &&
    lastCharacter(leaf, ctx) === "," &&
    ctx.lineNumber(leaf.to) < ctx.lineNumber(node.from)
  );
}

function lastTokenLeaf(node: SyntaxNode, ctx: LowerContext): SyntaxNode | null {
  if (SKIPPABLE.has(node.name) || node.from === node.to) return null;
  if (!node.firstChild) return lastCharacter(node, ctx) ? node : null;
  for (let child = node.lastChild; child; child = child.prevSibling) {
    const leaf = lastTokenLeaf(child, ctx);
    if (leaf) return leaf;
  }
  return null;
}

function lastCharacter(leaf: SyntaxNode, ctx: LowerContext): string | null {
  const text = ctx.read(leaf.from, leaf.to).trimEnd();
  return text ? text[text.length - 1]! : null;
}

const DECLARATION_STATEMENTS = nodeNameSet([
  "LuauFunctionTypeDeclaration",
  "LuauDataTypeDeclaration",
  "LuauDefine",
  "LuauShebang",
  "LuauStyle",
  "LuauLayout",
  "LuauScreen",
  "LuauComponent",
  "LuauAnimation",
  "LuauTheme",
  "LuauMorph",
  "LuauUntilCondition",
  "LuauStrayUntilStatement",
]);

export function isStatementNodeName(name: string): boolean {
  return (
    name === "LuauSemicolonSeparator" ||
    TRAILING_STATEMENT_NAMES.has(name) ||
    DECLARATION_STATEMENTS.has(name) ||
    BLOCK_NAMES.has(name)
  );
}

export function commaBeforeStatement(
  nodes: readonly (SyntaxNode | null | undefined)[],
  ctx: LowerContext,
): SyntaxNode | null {
  let comma: SyntaxNode | null = null;
  for (const node of nodes) {
    if (!node || SKIPPABLE.has(node.name)) continue;
    if (comma && startsStatement(node)) return comma;
    const leaf = lastTokenLeaf(node, ctx);
    comma = leaf && lastCharacter(leaf, ctx) === "," ? leaf : null;
  }
  return null;
}

function startsStatement(node: SyntaxNode): boolean {
  if (node.name === "LuauFunctionDefinition") {
    return findOwnDeclarationName(node) != null;
  }
  return (
    isStatementNodeName(node.name) &&
    !REASSIGNMENT_NAMES.has(node.name) &&
    !VARIABLE_DEFINITION_NAMES.has(node.name)
  );
}

function trailingType(stat: AstStat | undefined): AstType | undefined {
  const inner = stat instanceof AstStatSparkdownExplicit ? stat.statement : stat;
  if (inner instanceof AstStatTypeAlias) return inner.type;
  if (inner instanceof AstStatLocal && inner.values.length === 0) {
    return inner.vars[inner.vars.length - 1]?.annotation;
  }
  if (inner instanceof AstStatSparkdownStore && inner.values.length === 0) {
    return inner.annotations[inner.annotations.length - 1];
  }
  return trailingCast(stat)?.annotation;
}

function trailingCast(stat: AstStat | undefined): AstExprTypeAssertion | undefined {
  const inner = stat instanceof AstStatSparkdownExplicit ? stat.statement : stat;
  let value: AstExpr | undefined;
  if (inner instanceof AstStatLocal || inner instanceof AstStatAssign) {
    value = inner.values[inner.values.length - 1];
  } else if (inner instanceof AstStatSparkdownStore) {
    value = inner.values[inner.values.length - 1];
  } else if (inner instanceof AstStatCompoundAssign) {
    value = inner.value;
  } else if (inner instanceof AstStatReturn) {
    value = inner.list[inner.list.length - 1];
  }
  while (value) {
    if (value instanceof AstExprTypeAssertion) return value;
    if (value instanceof AstExprBinary) value = value.right;
    else if (value instanceof AstExprUnary) value = value.expr;
    else return undefined;
  }
  return undefined;
}

function astTypeNameSegments(type: AstType): number {
  if (type instanceof AstTypeReference && !type.hasParameterList) {
    return type.prefix ? 2 : 1;
  }
  return 0;
}

export function reportUntakenLineContinuation(
  nodes: SyntaxNode[],
  ctx: LowerContext,
  advice = "Join it to the value it continues.",
): void {
  for (const node of nodes) {
    if (!isLineContinuation(node) && !isExplicitRuleName(node.name, "LuauAccessPart")) {
      continue;
    }
    const raw = ctx.read(node.from, node.to);
    const text = raw.trim();
    const from = node.from + raw.length - raw.trimStart().length;
    const to = Math.max(from, node.from + raw.trimEnd().length);
    ctx.diagnostics?.push({
      message: `\`${text}\` continues the line before it, which does not end in a value it can continue. ${advice}`,
      severity: ErrorType.Error,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(from) + 1,
        endLineNumber: ctx.lineNumber(to) + 1,
        startCharacterNumber: ctx.characterNumber(from) + 1,
        endCharacterNumber: ctx.characterNumber(to) + 1,
      },
    });
  }
}

export function isTypeQualifierContinuation(nodes: SyntaxNode[]): boolean {
  let lines = 0;
  for (const node of nodes) {
    if (SKIPPABLE.has(node.name)) continue;
    if (!isLineContinuation(node)) return false;
    lines++;
    for (let part = lineContinuationContent(node); part; part = part.nextSibling) {
      if (SKIPPABLE.has(part.name)) continue;
      if (
        !isExplicitRuleName(part.name, "LuauAccessPart") ||
        part.firstChild?.name !== "LuauPropertyAccessor"
      ) {
        return false;
      }
    }
  }
  return lines > 0;
}

export const TYPE_NAME_EXTRA_QUALIFIER =
  "A type name takes at most one module prefix\n> e.g. `types.Button`, not `types.ui.Button`";

export function typeNameSegments(node: SyntaxNode): number {
  for (let n = lastSignificantLeaf(node); n && n !== node; n = n.parent) {
    if (n.name === "LuauTypeNameExtraQualifier" || isExplicitRuleName(n.name, "LuauTypeNameExtraQualifierContinuation")) return 3;
    if (n.name === "LuauQualifiedTypeFinalName") return 2;
    if (n.name === "LuauPrimitiveType") return 1;
    if (n.name === "LuauTypeName") {
      if (hasDescendant(n, "LuauTypeNameExtraQualifier")) return 3;
      return hasDescendant(n, "LuauVariableName") ? 2 : 1;
    }
    if (isExplicitRuleName(n.name, "LuauAccessPath")) {
      let segments = 0;
      for (let part = firstContentChild(n); part; part = part.nextSibling) {
        if (!isExplicitRuleName(part.name, "LuauAccessPart")) continue;
        const inner = part.firstChild?.name;
        if (inner !== "LuauVariable" && inner !== "LuauPropertyAccessor") {
          return 0;
        }
        segments++;
      }
      return segments;
    }
  }
  return 0;
}

export function endsInTypeName(node: SyntaxNode): boolean {
  return typeNameSegments(node) > 0;
}

export function continuationParts(nodes: SyntaxNode[]): SyntaxNode[] {
  const parts: SyntaxNode[] = [];
  for (const node of nodes) {
    if (isExplicitRuleName(node.name, "LuauAccessPart")) parts.push(node);
    if (!isLineContinuation(node)) continue;
    for (let part = lineContinuationContent(node); part; part = part.nextSibling) {
      if (isExplicitRuleName(part.name, "LuauAccessPart")) parts.push(part);
    }
  }
  return parts;
}

export function reportExtraTypeQualifiers(
  typeNode: SyntaxNode,
  parts: SyntaxNode[],
  ctx: LowerContext,
): void {
  reportExtraQualifiers(typeNameSegments(typeNode), parts, ctx);
}

function reportExtraQualifiers(
  segments: number,
  parts: SyntaxNode[],
  ctx: LowerContext,
): void {
  const extra = parts.slice(Math.max(0, 2 - segments));
  const first = extra[0];
  const last = extra[extra.length - 1];
  if (!first || !last) return;
  ctx.diagnostics?.push({
    message: TYPE_NAME_EXTRA_QUALIFIER,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(first.from) + 1,
      endLineNumber: ctx.lineNumber(last.to) + 1,
      startCharacterNumber: ctx.characterNumber(first.from) + 1,
      endCharacterNumber: ctx.characterNumber(last.to) + 1,
    },
  });
}

function hasDescendant(node: SyntaxNode, name: string): boolean {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (isExplicitRuleName(child.name, name) || hasDescendant(child, name)) return true;
  }
  return false;
}

function firstContentChild(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) return child.firstChild;
  }
  return null;
}

function lineContinuationContent(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) return child.firstChild;
  }
  return null;
}
