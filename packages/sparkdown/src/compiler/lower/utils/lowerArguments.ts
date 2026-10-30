import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { LowerContext } from "../context";

export const VARARGS_LOCAL_NAME = "__varargs$";

export function lowerArguments(
  parent: SyntaxNode,
  ctx: LowerContext,
): Argument[] {
  const paramsNode = getDescendent("LuauFunctionParameters", parent);
  if (!paramsNode) {
    return [];
  }
  const args: Argument[] = [];
  for (const node of getDescendents("LuauFunctionParameter", paramsNode)) {
    const name = ctx.read(node.from, node.to);
    args.push(new Argument(new Identifier(name), false, false));
  }
  if (getDescendent("LuauVariadicParameter", paramsNode)) {
    args.push(new Argument(new Identifier(VARARGS_LOCAL_NAME), false, false, true));
  }
  return args;
}
