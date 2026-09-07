import { type SyntaxNode } from "@lezer/common";
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
  // In-order walk of the target's subtree (recursing into children rather
  // than following siblings from the root), so `a.b` yields [a, b]. The
  // path builders for `-> a.b`, alternator arms, and expression literals
  // share this walk; the call form `-> f(x)` has a single name node and
  // stamps it through `divertPartIdentifier` directly.
  const parts: Identifier[] = [];
  const visit = (node: SyntaxNode): void => {
    if (node.name === "DivertPartName") {
      parts.push(divertPartIdentifier(node, ctx));
      return;
    }
    let child = node.firstChild;
    while (child) {
      visit(child);
      child = child.nextSibling;
    }
  };
  visit(target);
  return parts;
}

// One segment of a divert's target path as an Identifier stamped with the
// segment's own position. Every builder of a divert path that the author
// wrote goes through here (`-> a.b`, `-> f(x)`, a divert target in an
// expression, an alternator arm), so such a divert is positioned the same
// way whatever syntax produced it. Diverts the lowerers synthesize (loop
// and `done` control flow, function-call proxies) build their identifiers
// from names and carry no position.
export function divertPartIdentifier(
  part: SyntaxNode,
  ctx: LowerContext,
): Identifier {
  const identifier = new Identifier(ctx.read(part.from, part.to));
  identifier.debugMetadata = buildDebugMetadata(part.from, part.to, ctx, true);
  return identifier;
}
