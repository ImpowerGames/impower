import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { LowerContext } from "../context";

export function lowerDivertPath(
  target: SyntaxNode,
  ctx: LowerContext,
): Identifier[] {
  const terminator = getDescendent(["End", "Done"], target);
  if (terminator) {
    return [new Identifier(terminator.name === "End" ? "END" : "DONE")];
  }
  return getDescendents("DivertPartName", target).map(
    (part) => new Identifier(ctx.read(part.from, part.to)),
  );
}
