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

export interface LuauSource {
  top: SyntaxNode;
  errors: readonly LuauSyntaxError[];
}

export function documentText(ctx: LowerContext): string {
  const text = ctx.documentText?.();
  if (text === undefined) {
    throw new Error("The lowering context has no document text to read Luau from");
  }
  return text;
}

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

export function offsetAt(position: Position, ctx: LowerContext): number {
  const text = documentText(ctx);
  const start = lineStarts(text)[position.line];
  return start === undefined ? text.length : start + position.column;
}

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
  let found: SyntaxNode | null = null;
  for (
    let node: SyntaxNode | null = source.top.resolveInner(from, 1);
    node && node.from >= from;
    node = node.parent
  ) {
    if (names.has(node.name) && node.to <= to) found = node;
  }
  return found ?? nodeWithin(source, from, to, names);
}

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

// value-level: a reading error's message, naming the token it found
const GOT_EOF = /got <eof>(?=;|$)/;

function endingAt(errors: readonly LuauSyntaxError[], end: number, ctx: LowerContext): readonly LuauSyntaxError[] {
  const token = nextLuauToken(end, documentText(ctx));
  if (!token || token.from !== end) return errors;
  const text = documentText(ctx);
  const begin = positionAt(token.from, ctx);
  const location = new Location(begin, positionAt(token.from + token.text.length, ctx));
  return errors.map((error) => {
    // value-level: a reading error's message, naming the token it found
    if (!GOT_EOF.test(error.message)) return error;
    const message = error.message.replace(GOT_EOF, `got '${token.text}'`);
    const from = offsetAt(error.location.begin, ctx);
    const to = offsetAt(error.location.end, ctx);
    const atEnd = nextLuauToken(to, text)?.from === token.from;
    if (from === to && atEnd) return { ...error, message, location };
    return { ...error, message, location: atEnd ? new Location(error.location.begin, begin) : error.location };
  });
}

export function readBlockAst(
  nodes: readonly SyntaxNode[],
  ctx: LowerContext,
  afterType = false,
): { unit: LuauAstUnit; source: LuauSource } | null {
  const first = nodes[0];
  if (!first) return null;
  const unit = readLuauBlock(nodes, documentText(ctx), afterType);
  reportNestedAlternators(unit.root, ctx);
  return { unit, source: { top: topOf(first), errors: unit.errors } };
}

export function methodSyntaxErrors(node: SyntaxNode, ctx: LowerContext): readonly LuauSyntaxError[] {
  return readLuauMethod(node, documentText(ctx)).errors;
}

export function closureSyntaxErrors(content: SyntaxNode, ctx: LowerContext): readonly LuauSyntaxError[] {
  return readLuauStatements([content], documentText(ctx)).errors;
}

export function closureBodyAst(content: SyntaxNode, ctx: LowerContext): import("../../typecheck/Ast").AstStatBlock | null {
  const { expr } = readLuauStatements([content], documentText(ctx));
  reportNestedAlternators(expr, ctx);
  return expr instanceof AstExprFunction ? expr.body : null;
}

export function errorMessage(
  node: AstExprError | AstStatError,
  source: LuauSource,
): string | undefined {
  return source.errors[node.messageIndex]?.message;
}

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
