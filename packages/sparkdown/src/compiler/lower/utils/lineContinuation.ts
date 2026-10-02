import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { LowerContext } from "../context";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  VARIABLE_DEFINITION_NAMES,
  ownAssignmentOperation,
} from "../../utils/variableDefinitionNames";
import { REASSIGNMENT_NAMES } from "../../utils/reassignmentNames";
import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import { findOwnDeclarationName } from "./findOwnDeclarationName";
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

// A `LuauLineContinuation` is a line of Luau code that begins with `.name`,
// `:name`, a binary operator or a cast's `::` and so continues the expression
// on the line before it (`t` then `.a` reads as `t.a`). In a statement body a
// line that begins with `-` does too (`LuauMinusLineContinuation`), since no
// statement begins with `-`, and outside a table a line that begins with `[`
// indexes it (`LuauIndexerLineContinuation`). The grammar cannot nest these
// in the expression, which has already closed at its own line's end, so each
// is a sibling of the statement that line ended.
//
// The converter reads a block's statements across these lines as Luau does,
// and records the nodes each statement was read from (`lowerStatements`). A
// line that no statement before it takes is reported here, as the line it
// continues does not end in a value it can continue.

const LINE_CONTINUATION = nodeNameSet([
  "LuauLineContinuation",
  "LuauMinusLineContinuation",
  "LuauIndexerLineContinuation",
]);

// Whether `node` is a line that continues the line before it.
export function isLineContinuation(node: { name: string }): boolean {
  return LINE_CONTINUATION.has(node.name);
}

const CONTINUATION_BRIDGE: ReadonlySet<string> = new Set([
  "Newline",
  "ExtraWhitespace",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
  "LuauTypeTrailingBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
  "LuauTypeTrailingBlockCommentClose",
]);

const SKIPPABLE: ReadonlySet<string> = new Set([
  ...CONTINUATION_BRIDGE,
  "Whitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "LuauComment",
  "LuauReturnLineBreak",
]);

// The lines at the start of a function body that qualify the name its return
// type ends with (`function f(): types` then `.Button`), with that return
// type. A return type takes in the line break after it, so the body opens at
// the next line and those lines are its first children rather than siblings
// of a statement. Null when the body does not start with such lines.
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

// The `= value` that ends the union member lines after the declaration
// `node`, across blank and comment lines, which the declaration ended
// before (`local v: number` then `-- note` then `| string = 1`).
export function typeUnionLineValue(node: SyntaxNode): SyntaxNode | null {
  if (!endsInTypeAnnotation(node)) return null;
  let value: SyntaxNode | null = null;
  for (let scan = node.nextSibling; scan; scan = scan.nextSibling) {
    if (SKIPPABLE.has(scan.name)) continue;
    if (scan.name !== "LuauTypeUnionLineContinuation") break;
    for (let part = firstContentChild(scan); part; part = part.nextSibling) {
      if (part.name === "LuauAssignmentOperation") value = part;
    }
  }
  return value;
}

// Whether the declaration `node` ends in its last target's type annotation,
// with no value after it (`local v: number`).
function endsInTypeAnnotation(node: SyntaxNode): boolean {
  if (node.name !== "LuauVariableDefinition" && node.name !== "LuauSparkdownVariableDefinition") {
    return false;
  }
  let content: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) content = child;
  }
  let last: SyntaxNode | null = content?.lastChild ?? null;
  while (last && SKIPPABLE.has(last.name)) last = last.prevSibling;
  return (
    last?.name === "LuauVariableAssignment" &&
    hasDescendant(last, "LuauTypeAnnotationOperation") &&
    !ownAssignmentOperation(last)
  );
}

// Whether the union member line `line` (a `LuauTypeUnionLineContinuation`)
// continues a type: the nearest node before it, across blank and comment
// lines, is a declaration that ends in its type, a type alias, an annotated
// parameter, or another such line with no value; or it starts a function
// body after the function's return type.
export function hasTypeUnionLineOwner(line: SyntaxNode): boolean {
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
  if (prev.name === "LuauTypeUnionLineContinuation") {
    return !hasDescendant(prev, "LuauAssignmentOperation");
  }
  return (
    prev.name === "LuauDataTypeDeclaration" ||
    prev.name === "LuauTypeAnnotationOperation" ||
    endsInTypeAnnotation(prev)
  );
}

// Report a union member line that continues no type (`print(1)` then
// `-- note` then `| string`), which Luau rejects.
export function reportUnownedTypeUnionLine(line: SyntaxNode, ctx: LowerContext): void {
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

/**
 * Reports a continuation line that no statement before it took: one after
 * a statement that does not end in a value (`end`, a bare `return`), with
 * no statement before it in its block, or after a type that cannot take it.
 * `previous` is the statement before it, which the converter read. A line
 * of `.Name` parts after a type name with a module prefix already
 * (`local x: types.ui` then `.Button`) gives the name a second prefix,
 * which Luau does not read; one after a cast that cannot take it (`t ::
 * { x: number }` then `.a`) is the cast's value accessed, which needs the
 * cast in parentheses.
 */
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

/**
 * Whether the continuation line `line`, which the converter read as part of
 * the statement before it, continues that statement in vain: the reading
 * fails at the line's first token, since the line before it does not end in
 * a value (a bare `return` then `.a`, `tostring(` then `.a)`). After a comma
 * the value is missing from the list, which the statement's own validators
 * report at the comma (`local a, g = 1,` then `.x`).
 */
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

/**
 * Reports a continuation line inside a value's parentheses, braces or call
 * arguments (`tostring(` then `.a)`, `{` then `.a }`) that begins where a
 * value should, as the converter found reading `expr` there: the line
 * continues nothing. A line in a block is reported by the block
 * (`lowerStatements`).
 */
export function reportValueInVain(
  expr: AstExpr,
  source: LuauSource,
  ctx: LowerContext,
): void {
  // Luau reads on past the missing value, so the line's own links hang on
  // the error (`.a` is the error indexed by `a`).
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

// The last character of the token before `node`, past whitespace and
// comments, or null at the document's start.
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

/**
 * Whether `node` begins a line after a line that ends with a comma, where a
 * statement is left to the enclosing block (`commaBeforeStatement`).
 */
export function followsLineEndingComma(node: SyntaxNode, ctx: LowerContext): boolean {
  const leaf = previousTokenLeaf(node, ctx);
  return (
    leaf != null &&
    lastCharacter(leaf, ctx) === "," &&
    ctx.lineNumber(leaf.to) < ctx.lineNumber(node.from)
  );
}

// The last leaf under `node` that holds a token, past whitespace and
// comments.
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

// The statements `LuauDeclarations` reaches besides the trailing ones, and
// the blocks and loops `LuauControlBlock` does (matched by their suffix).
// `statementBoundary.test.ts` holds this classification to the grammar.
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
]);

// Whether `name` is a node that starts a statement in a block, or a `;`
// that ends one, so no value can begin with it.
export function isStatementNodeName(name: string): boolean {
  return (
    name === "LuauSemicolonSeparator" ||
    TRAILING_STATEMENT_NAMES.has(name) ||
    DECLARATION_STATEMENTS.has(name) ||
    /(?:Block|Blocks|Loop)$/.test(name)
  );
}

/**
 * The comma left without a value by a statement on the line after it, among
 * a declaration's or a reassignment's last list item and the nodes the
 * statement continues into (`nodes`, in order), or null. Luau reads a word
 * that begins some of Sparkdown's statements as a name (`continue`, `goto`,
 * `type`, `export`), and a named function's `function` as the start of a
 * value, so the converter continues the list into that line. Sparkdown's
 * grammar reads the line as a statement of the enclosing block, and reports
 * the comma before it as Luau reports one before `end`. An assignment or a
 * declaration on that line is left to its own reports (a second `=`).
 */
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

// Whether `node`, the first node of a line after a comma, is a statement
// Luau reads as part of the list: an anonymous function is a value.
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

// The type a statement ends with, when it ends with one: a type alias's,
// the annotation of the last name a declaration with no value declares, or
// the type a cast at the end of its last value casts to.
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

// The cast a statement's last value ends with (`t :: T`, `1 + t :: T`).
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

// How many dot-separated segments a type name has (`types.Button` has two),
// or 0 when the type is not a name a `.Name` line could qualify.
function astTypeNameSegments(type: AstType): number {
  if (type instanceof AstTypeReference && !type.hasParameterList) {
    return type.prefix ? 2 : 1;
  }
  return 0;
}

// Report continuation lines, or the access parts of one, that nothing on
// the line before them takes. `advice` replaces the default advice, to join
// the line to its value.
export function reportUntakenLineContinuation(
  nodes: SyntaxNode[],
  ctx: LowerContext,
  advice = "Join it to the value it continues.",
): void {
  for (const node of nodes) {
    if (!isLineContinuation(node) && node.name !== "LuauAccessPart") {
      continue;
    }
    const raw = ctx.read(node.from, node.to);
    const text = raw.trim();
    const from = node.from + raw.length - raw.trimStart().length;
    ctx.diagnostics?.push({
      message: `\`${text}\` continues the line before it, which does not end in a value it can continue. ${advice}`,
      severity: ErrorType.Error,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(from) + 1,
        endLineNumber: ctx.lineNumber(node.to) + 1,
        startCharacterNumber: ctx.characterNumber(from) + 1,
        endCharacterNumber: ctx.characterNumber(node.to) + 1,
      },
    });
  }
}

// Whether `nodes` are continuation lines that only qualify a type name
// (`types` then `.Button`), which Luau reads as one qualified type.
export function isTypeQualifierContinuation(nodes: SyntaxNode[]): boolean {
  let lines = 0;
  for (const node of nodes) {
    if (SKIPPABLE.has(node.name)) continue;
    if (!isLineContinuation(node)) return false;
    lines++;
    for (let part = lineContinuationContent(node); part; part = part.nextSibling) {
      if (SKIPPABLE.has(part.name)) continue;
      if (
        part.name !== "LuauAccessPart" ||
        part.firstChild?.name !== "LuauPropertyAccessor"
      ) {
        return false;
      }
    }
  }
  return lines > 0;
}

// Luau reads at most one module prefix in a type name (`module.Type`).
export const TYPE_NAME_EXTRA_QUALIFIER =
  "A type name takes at most one module prefix\n> e.g. `types.Button`, not `types.ui.Button`";

// How many dot-separated segments the type name that the type syntax in
// `node` ends with has, leaving out any comment and whitespace after it, or 0
// when it does not end in a name, so that a `.Name` continuation can qualify
// it (`types` then `.Button`, but not `{ x: number }` then `.b`). A module
// named like a primitive (`string` then `.Button`) reads as a
// `LuauPrimitiveType` until its qualifier is on the same line.
export function typeNameSegments(node: SyntaxNode): number {
  for (let n = lastSignificantLeaf(node); n && n !== node; n = n.parent) {
    if (n.name === "LuauPrimitiveType") return 1;
    if (n.name === "LuauTypeName") {
      if (hasDescendant(n, "LuauTypeNameExtraQualifier")) return 3;
      return hasDescendant(n, "LuauVariableName") ? 2 : 1;
    }
    if (n.name === "LuauAccessPath") {
      let segments = 0;
      for (let part = firstContentChild(n); part; part = part.nextSibling) {
        if (part.name !== "LuauAccessPart") continue;
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

// The access parts of `nodes`: those of each continuation line, and any
// access part already expanded from one.
export function continuationParts(nodes: SyntaxNode[]): SyntaxNode[] {
  const parts: SyntaxNode[] = [];
  for (const node of nodes) {
    if (node.name === "LuauAccessPart") parts.push(node);
    if (!isLineContinuation(node)) continue;
    for (let part = lineContinuationContent(node); part; part = part.nextSibling) {
      if (part.name === "LuauAccessPart") parts.push(part);
    }
  }
  return parts;
}

// Report the continued `parts` that give the type name `typeNode` ends with
// more than one module prefix (`types.ui` then `.Button`), as the same name
// written on one line is reported.
export function reportExtraTypeQualifiers(
  typeNode: SyntaxNode,
  parts: SyntaxNode[],
  ctx: LowerContext,
): void {
  reportExtraQualifiers(typeNameSegments(typeNode), parts, ctx);
}

// Report the `parts` that continue a type name of `segments` segments past
// its one module prefix.
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
    if (child.name === name || hasDescendant(child, name)) return true;
  }
  return false;
}

function firstContentChild(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) return child.firstChild;
  }
  return null;
}

function lastSignificantLeaf(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.lastChild; child; child = child.prevSibling) {
    if (SKIPPABLE.has(child.name) || child.from === child.to) continue;
    if (!child.firstChild) return child;
    const leaf = lastSignificantLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

function lineContinuationContent(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) return child.firstChild;
  }
  return null;
}
