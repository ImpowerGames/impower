import { type SyntaxNode } from "@lezer/common";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { LowerContext } from "../context";

// The terminator names `END` / `DONE` are no longer part of divert
// syntax — sparkdown uses the bare `fin` / `done` statement keywords
// instead, lowered separately by `lowerDoneOrFin`. So this helper
// just walks `DivertPartName` segments and turns them into Identifiers.
export function lowerDivertPath(
  target: SyntaxNode,
  ctx: LowerContext,
): Identifier[] {
  return getDescendents("DivertPartName", target).map(
    (part) => new Identifier(ctx.read(part.from, part.to)),
  );
}
