import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { LowerContext } from "../context";

export function lowerArguments(
  parent: SyntaxNode,
  ctx: LowerContext,
): Argument[] {
  const paramsNode = getDescendent("LuauFunctionParameters", parent);
  if (!paramsNode) {
    return [];
  }
  return getDescendents("LuauFunctionParameter", paramsNode).map((node) => {
    const name = ctx.read(node.from, node.to);
    return new Argument(new Identifier(name), false, false);
  });
}
