import { type SyntaxNode } from "@lezer/common";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { LowerContext } from "../context";
import { buildDebugMetadata } from "./debugMetadata";

// The terminator names `END` / `DONE` are no longer part of divert
// syntax — sparkdown uses the bare `fin` / `done` statement keywords
// instead, lowered separately by `lowerDoneOrFin`. So this helper
// just walks `DivertPartName` segments and turns them into Identifiers.
//
// Each identifier carries the position of its own segment, with 1-based
// character numbers: diagnostics attributed to a divert's target (`target
// not found`, a divert captured by a builtin global) go through the
// compiler's diagnostic handler, which reads that convention. The divert
// node itself inherits its statement's or its scene's position, so the
// target's name is the only precise anchor a divert has. The incremental
// restamp (`restampContent`) offsets these along with the node's own.
export function lowerDivertPath(
  target: SyntaxNode,
  ctx: LowerContext,
): Identifier[] {
  return getDescendents("DivertPartName", target).map((part) =>
    divertPartIdentifier(part, ctx),
  );
}

// One segment of a divert's target path as an Identifier stamped with the
// segment's own position. Every place that builds a divert's path
// identifiers goes through here, so a divert is positioned the same way
// whatever syntax produced it (`-> a.b`, `-> f(x)`, a divert target in an
// expression, an alternator arm).
export function divertPartIdentifier(
  part: SyntaxNode,
  ctx: LowerContext,
): Identifier {
  const identifier = new Identifier(ctx.read(part.from, part.to));
  identifier.debugMetadata = buildDebugMetadata(part.from, part.to, ctx, true);
  return identifier;
}
