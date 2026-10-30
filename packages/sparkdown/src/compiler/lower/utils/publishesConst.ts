import type { SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../runtime/Error";
import {
  AstExprCall,
  AstExprError,
  AstExprFunction,
  AstExprGlobal,
  AstExprLocal,
  AstExprVarargs,
  AstStatAssign,
  AstStatCompoundAssign,
  AstStatFunction,
  AstStatLocal,
  AstStatTypeFunction,
  AstType,
  AstTypePack,
  visitAst,
  type AstExpr,
  type AstNode,
} from "../../typecheck/Ast";
import { isCheckedLuauAt } from "../../typecheck/LuauUnitNodes";
import type { Location } from "../../typecheck/Location";
import type { LowerContext } from "../context";
import { offsetAt, rangeOf } from "./luauAst";
import { functionBindings, resolveFunctionBinding } from "./functionBindings";
import { makeSource } from "./validateDefineStructure";

export function publishesConst(ctx: LowerContext): boolean {
  return !ctx.functionScopeStack?.length && !ctx.localConsts;
}

export function reportLuauConstError(
  message: string,
  location: Location,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  const range = rangeOf(location, ctx);
  if (isCheckedLuauAt(node, range.from, (from, to) => ctx.read(from, to))) return;
  const source = makeSource(range.from, range.to, ctx);
  const reported = ctx.diagnostics?.some(
    (d) =>
      d.message === message &&
      d.source?.startLineNumber === source.startLineNumber &&
      d.source?.startCharacterNumber === source.startCharacterNumber,
  );
  if (reported) return;
  ctx.diagnostics?.push({ message, severity: ErrorType.Error, source });
}

export function reassignedConstName(target: AstExpr): AstExprLocal | undefined {
  if (
    target instanceof AstExprError &&
    target.expressions.length === 1 &&
    target.expressions[0] instanceof AstExprLocal &&
    target.expressions[0].local.isConst
  ) {
    return target.expressions[0];
  }
  return undefined;
}

export function reportReassignedConst(
  target: AstExpr,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  if (publishesConst(ctx)) return;
  const local = reassignedConstName(target);
  const name = local
    ? local.local.name
    : target instanceof AstExprGlobal &&
        resolveFunctionBinding(target.name, offsetAt(target.location.begin, ctx), ctx)?.isConst
      ? target.name
      : undefined;
  if (name === undefined) return;
  reportLuauConstError(
    `Variable '${name}' is constant and may not be reassigned`,
    (local ?? target).location,
    node,
    ctx,
  );
}

export function reportMissingConstInitializer(
  stat: AstStatLocal,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  if (!stat.isConst || publishesConst(ctx)) return;
  const last = stat.values[stat.values.length - 1];
  const spreads = last instanceof AstExprCall || last instanceof AstExprVarargs;
  if (spreads || stat.values.length >= stat.vars.length) return;
  reportLuauConstError("Missing initializer in const declaration", stat.location, node, ctx);
}

export function reportErasedConstErrors(
  root: AstNode,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  const check = (fn: AstExprFunction, isolated = false): void => {
    const outer = ctx.functionBindingsStack;
    if (isolated && outer) ctx.functionBindingsStack = [];
    ctx.functionBindingsStack?.push(
      functionBindings([...(fn.self ? [fn.self] : []), ...fn.args], fn.body, ctx),
    );
    visitAst(fn, {
      visit: (n) => {
        if (n === fn) return true;
        if (n instanceof AstExprFunction) {
          check(n);
          return false;
        }
        if (n instanceof AstStatTypeFunction) {
          check(n.body, true);
          return false;
        }
        if (n instanceof AstStatAssign) for (const v of n.vars) reportReassignedConst(v, node, ctx);
        else if (n instanceof AstStatCompoundAssign) reportReassignedConst(n.variable, node, ctx);
        else if (n instanceof AstStatFunction) reportReassignedConst(n.name, node, ctx);
        else if (n instanceof AstStatLocal) reportMissingConstInitializer(n, node, ctx);
        return true;
      },
    });
    ctx.functionBindingsStack?.pop();
    if (isolated && outer) ctx.functionBindingsStack = outer;
  };
  const inType = (type: AstNode): void => {
    visitAst(type, {
      visit: (n) => {
        if (n instanceof AstExprFunction) {
          check(n);
          return false;
        }
        return true;
      },
    });
  };
  visitAst(root, {
    visit: (n) => {
      if (n instanceof AstStatTypeFunction) {
        check(n.body, true);
        return false;
      }
      if (n !== root && n instanceof AstExprFunction) return false;
      if (n instanceof AstType || n instanceof AstTypePack) {
        inType(n);
        return false;
      }
      return true;
    },
  });
}
