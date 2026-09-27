// Helpers over the syntax tree, ported from Luau's `AstUtils.h`/`.cpp`; Luau
// is MIT-licensed (see `LICENSE-luau.txt`).

import { AstExpr, AstExprCall, AstExprConstantString, AstExprGlobal, AstExprTable, BinaryOp, visitAst, type AstNode } from "./Ast";
import type { TypeId } from "./Type";

/** A `type(x) == "name"` or `typeof(x) == "name"` test. */
export interface TypeGuard {
  isTypeof: boolean;
  target: AstExpr;
  type: string;
}

export function matchTypeGuard(op: BinaryOp, left: AstExpr, right: AstExpr): TypeGuard | undefined {
  if (op !== BinaryOp.CompareEq && op !== BinaryOp.CompareNe) return undefined;
  if (right instanceof AstExprCall) [left, right] = [right, left];
  if (!(right instanceof AstExprConstantString)) return undefined;
  const call = left instanceof AstExprCall ? left : undefined;
  const string = right;
  if (!call) return undefined;
  const callee = call.func instanceof AstExprGlobal ? call.func : undefined;
  if (!callee) return undefined;
  if (callee.name !== "type" && callee.name !== "typeof") return undefined;
  if (call.args.length !== 1) return undefined;
  return { isTypeof: callee.name === "typeof", target: call.args[0]!, type: string.value };
}

/**
 * Adds the types of the table literals in an expression, which are known to
 * be uniquely held references, to `uniqueTypes`.
 */
export function findUniqueTypes(uniqueTypes: Set<TypeId>, expr: AstExpr, astTypes: ReadonlyMap<AstExpr, TypeId>): void {
  visitAst(expr, {
    visit(node: AstNode): boolean {
      if (node instanceof AstExprTable) {
        const ty = astTypes.get(node);
        if (ty) uniqueTypes.add(ty);
        return true;
      }
      return !(node instanceof AstExpr);
    },
  });
}

/** `findUniqueTypes` over each table literal among several expressions. */
export function findUniqueTypesIn(uniqueTypes: Set<TypeId>, exprs: readonly AstExpr[], astTypes: ReadonlyMap<AstExpr, TypeId>): void {
  for (const expr of exprs) {
    if (expr instanceof AstExprTable) findUniqueTypes(uniqueTypes, expr, astTypes);
  }
}
