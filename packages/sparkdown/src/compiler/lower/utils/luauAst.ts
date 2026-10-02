// The lowerers read Luau as the converter in `typecheck/readLuauAst.ts`
// builds it from the syntax tree: one AST, which the type checker reads too,
// with Luau's precedence, call chains, call sugar and statement extents
// decided once (#1283). These helpers read that AST for the nodes a lowerer
// holds and map its locations back to the document offsets the lowerers
// stamp and report with.

import type { SyntaxNode } from "@lezer/common";
import type { AstExprError, AstStatError } from "../../typecheck/Ast";
import type { Location, Position } from "../../typecheck/Location";
import {
  readLuauBlock,
  readLuauExpression,
  type LuauAstUnit,
  type LuauSyntaxError,
} from "../../typecheck/readLuauAst";
import type { LowerContext } from "../context";

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

/** The one Luau expression some nodes hold, as the converter reads it. */
export function readExpressionAst(
  nodes: readonly SyntaxNode[],
  ctx: LowerContext,
): { expr: import("../../typecheck/Ast").AstExpr; source: LuauSource } | null {
  const first = nodes[0];
  if (!first) return null;
  const { expr, errors } = readLuauExpression(nodes, documentText(ctx));
  return { expr, source: { top: topOf(first), errors } };
}

/** The Luau statements some sibling nodes hold, read as one block. */
export function readBlockAst(
  nodes: readonly SyntaxNode[],
  ctx: LowerContext,
): { unit: LuauAstUnit; source: LuauSource } | null {
  const first = nodes[0];
  if (!first) return null;
  const unit = readLuauBlock(nodes, documentText(ctx));
  return { unit, source: { top: topOf(first), errors: unit.errors } };
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
