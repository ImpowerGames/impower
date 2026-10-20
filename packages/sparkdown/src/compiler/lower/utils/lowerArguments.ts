import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { LowerContext } from "../context";

// Synthetic local name that holds the variadic-args MultiValue inside
// a `function f(a, ...) ... end` body. The lowerer emits a read of
// this name for every `...` expression site. Like every name the
// compiler generates (#1729), it holds a `$`, which no identifier can
// contain, so no local or parameter an author writes can bind it
// (#1747), and the Variables view leaves it out.
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
  // Walk parameters in source order. The grammar interleaves
  // `LuauFunctionParameter`, `LuauVariadicParameter`, and skipped
  // nodes (commas, comments, type annotations) — we filter for the
  // two we care about so a trailing `...` lands at the right
  // position. The vararg always comes last in Luau, but reading in
  // tree order keeps the implementation tolerant of grammar quirks.
  for (const node of getDescendents("LuauFunctionParameter", paramsNode)) {
    const name = ctx.read(node.from, node.to);
    args.push(new Argument(new Identifier(name), false, false));
  }
  if (getDescendent("LuauVariadicParameter", paramsNode)) {
    args.push(new Argument(new Identifier(VARARGS_LOCAL_NAME), false, false, true));
  }
  return args;
}
