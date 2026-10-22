// The lowerers read Luau as the converter in `typecheck/readLuauAst.ts`
// builds it from the syntax tree: one AST, which the type checker reads too,
// with Luau's precedence, call chains, call sugar and statement extents
// decided once (#1283). These helpers read that AST for the nodes a lowerer
// holds and map its locations back to the document offsets the lowerers
// stamp and report with.

import type { SyntaxNode } from "@lezer/common";
import type { AstExprError, AstStatError } from "../../typecheck/Ast";
import { AstExprFunction } from "../../typecheck/Ast";
import { Location, Position } from "../../typecheck/Location";
import {
  nextLuauToken,
  readLuauBlock,
  readLuauExpression,
  readLuauMethod,
  readLuauStatements,
  type LuauAstUnit,
  type LuauSyntaxError,
} from "../../typecheck/readLuauAst";
import type { LowerContext } from "../context";
import { reportNestedAlternators } from "./alternatorArms";

/**
 * What an AST was read from: the syntax tree it came from, for the nodes a
 * lowerer still walks (a function's body, which holds Sparkdown lines beside
 * its Luau), and the syntax errors the reading found, which an
 * `AstExprError` or `AstStatError` names by index.
 */
export interface LuauSource {
  /** The tree's top node. */
  top: SyntaxNode;
  errors: readonly LuauSyntaxError[];
}

/** The text of the document being lowered. */
export function documentText(ctx: LowerContext): string {
  const text = ctx.documentText?.();
  if (text === undefined) {
    throw new Error("The lowering context has no document text to read Luau from");
  }
  return text;
}

// The line starts of the last document whose positions were mapped, since a
// document's statements are lowered one after another.
let lastLines: { text: string; starts: number[] } | undefined;

function lineStarts(text: string): number[] {
  if (lastLines?.text !== text) {
    const starts = [0];
    // value-level: document text, mapping AST line positions to offsets
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) {
      starts.push(i + 1);
    }
    lastLines = { text, starts };
  }
  return lastLines.starts;
}

/** The document offset of a position in the converter's AST. */
export function offsetAt(position: Position, ctx: LowerContext): number {
  const text = documentText(ctx);
  const start = lineStarts(text)[position.line];
  return start === undefined ? text.length : start + position.column;
}

/**
 * The syntax node of a function the converter read with attributes
 * (`@native function`, `@checked -- note` then `local function`): the
 * first node of a kind in `names` after its last attribute. The converter
 * includes the attributes in the function's location, but the syntax tree
 * holds them, and any comment after them, in nodes of their own before the
 * function's. Undefined for a function without attributes.
 */
export function nodeAfterAttributes(
  func: { location: Location; attributes: readonly { location: Location }[] },
  source: LuauSource,
  names: ReadonlySet<string>,
  ctx: LowerContext,
): SyntaxNode | null | undefined {
  const last = func.attributes[func.attributes.length - 1];
  if (!last) return undefined;
  const from = offsetAt(last.location.end, ctx);
  const to = offsetAt(func.location.end, ctx);
  // The function's node can begin right at the attribute's end, holding the
  // whitespace before `function`; the outermost such node is the function's.
  let found: SyntaxNode | null = null;
  for (
    let node: SyntaxNode | null = source.top.resolveInner(from, 1);
    node && node.from >= from;
    node = node.parent
  ) {
    if (names.has(node.name) && node.to <= to) found = node;
  }
  // Otherwise a comment stands between them, and the function's node is a
  // later sibling.
  return found ?? nodeWithin(source, from, to, names);
}

/** The document range of a location in the converter's AST. */
export function rangeOf(
  location: Location,
  ctx: LowerContext,
): { from: number; to: number } {
  return { from: offsetAt(location.begin, ctx), to: offsetAt(location.end, ctx) };
}

function topOf(node: SyntaxNode): SyntaxNode {
  let top = node;
  while (top.parent) top = top.parent;
  return top;
}

/** The position of a document offset in the converter's AST, as `offsetAt` maps it back. */
function positionAt(offset: number, ctx: LowerContext): Position {
  const starts = lineStarts(documentText(ctx));
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return new Position(low, offset - starts[low]!);
}

/**
 * The one Luau expression some nodes hold, as the converter reads it. Each
 * alternator the reading holds, which it reads as one opaque value, has its
 * own head and arms read (`reportNestedAlternators`), whether or not lowering
 * reaches it (I-1435).
 *
 * `end` is the document offset of the token that ends the expression where
 * the author wrote one after it: a story brace's `}`, or the `|`, `end` or
 * next value after an alternator's value. The reading meets its end of input
 * there, and names it as that token, as Luau's reading of the brace or arm
 * would (I-1445): an error at the end of input is reported at the token, and
 * every `got <eof>` names it (`got '}'`), as a Sparkle closure's reading
 * names its `}` (`closureReadingErrors`).
 */
export function readExpressionAst(
  nodes: readonly SyntaxNode[],
  ctx: LowerContext,
  end?: number,
): { expr: import("../../typecheck/Ast").AstExpr; source: LuauSource } | null {
  const first = nodes[0];
  if (!first) return null;
  const { expr, errors } = readLuauExpression(nodes, documentText(ctx));
  reportNestedAlternators(expr, ctx);
  return { expr, source: { top: topOf(first), errors: end === undefined ? errors : endingAt(errors, end, ctx) } };
}

// A message's `got <eof>`, the token the error found.
const GOT_EOF = /got <eof>(?=;|$)/;

/** A reading's errors with its end of input named as the token at `end` (`readExpressionAst`). */
function endingAt(errors: readonly LuauSyntaxError[], end: number, ctx: LowerContext): readonly LuauSyntaxError[] {
  const token = nextLuauToken(end, documentText(ctx));
  if (!token || token.from !== end) return errors;
  const text = documentText(ctx);
  const begin = positionAt(token.from, ctx);
  const location = new Location(begin, positionAt(token.from + token.text.length, ctx));
  return errors.map((error) => {
    if (!GOT_EOF.test(error.message)) return error;
    const message = error.message.replace(GOT_EOF, `got '${token.text}'`);
    // The end of input itself stands where the reading's last token ends,
    // with only whitespace and comments between it and the token.
    const from = offsetAt(error.location.begin, ctx);
    const to = offsetAt(error.location.end, ctx);
    const atEnd = nextLuauToken(to, text)?.from === token.from;
    if (from === to && atEnd) return { ...error, message, location };
    // An error that runs to the token Luau found (`x:m`'s missing call
    // arguments) runs to the token's start.
    return { ...error, message, location: atEnd ? new Location(error.location.begin, begin) : error.location };
  });
}

/**
 * The Luau statements some sibling nodes hold, read as one block; with
 * `afterType`, as the rest of a type the nodes begin by continuing (see
 * `readLuauBlock`).
 */
export function readBlockAst(
  nodes: readonly SyntaxNode[],
  ctx: LowerContext,
  afterType = false,
): { unit: LuauAstUnit; source: LuauSource } | null {
  const first = nodes[0];
  if (!first) return null;
  const unit = readLuauBlock(nodes, documentText(ctx), afterType);
  // As in an expression's reading (`readExpressionAst`).
  reportNestedAlternators(unit.root, ctx);
  return { unit, source: { top: topOf(first), errors: unit.errors } };
}

/** The syntax errors of a `define`'s method, read as the function value it stands for (`readLuauMethod`). */
export function methodSyntaxErrors(node: SyntaxNode, ctx: LowerContext): readonly LuauSyntaxError[] {
  return readLuauMethod(node, documentText(ctx)).errors;
}

/** The syntax errors of a Sparkle closure's body, read as the body of the function value it runs as (`readLuauStatements`). */
export function closureSyntaxErrors(content: SyntaxNode, ctx: LowerContext): readonly LuauSyntaxError[] {
  return readLuauStatements([content], documentText(ctx)).errors;
}

/** A Sparkle closure's body, read as the body of the function value it runs as (`readLuauStatements`), or null when the reading is not one. */
export function closureBodyAst(content: SyntaxNode, ctx: LowerContext): import("../../typecheck/Ast").AstStatBlock | null {
  const { expr } = readLuauStatements([content], documentText(ctx));
  // As in an expression's reading (`readExpressionAst`).
  reportNestedAlternators(expr, ctx);
  return expr instanceof AstExprFunction ? expr.body : null;
}

/** The message of the syntax error an error node names. */
export function errorMessage(
  node: AstExprError | AstStatError,
  source: LuauSource,
): string | undefined {
  return source.errors[node.messageIndex]?.message;
}

/**
 * The first node of a kind that lies within `[from, to)`, in document
 * order: the `=` of a table's keyed field, between its key and its value.
 */
export function nodeWithin(
  source: LuauSource,
  from: number,
  to: number,
  names: ReadonlySet<string>,
): SyntaxNode | null {
  let scope: SyntaxNode = source.top.resolveInner(from, 1);
  while (scope.parent && (scope.from > from || scope.to < to)) {
    scope = scope.parent;
  }
  const search = (node: SyntaxNode): SyntaxNode | null => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.to <= from) continue;
      if (child.from >= to) break;
      if (names.has(child.name) && child.from >= from) return child;
      const found = search(child);
      if (found) return found;
    }
    return null;
  };
  return search(scope);
}

/**
 * The node of a kind that holds a construct beginning at a document offset:
 * the nearest such node above the innermost node there, which may begin
 * before the construct with the whitespace the grammar puts in it.
 */
export function enclosingNode(
  source: LuauSource,
  offset: number,
  names: ReadonlySet<string>,
): SyntaxNode | null {
  for (
    let node: SyntaxNode | null = source.top.resolveInner(offset, 1);
    node;
    node = node.parent
  ) {
    if (names.has(node.name)) return node;
  }
  return null;
}
