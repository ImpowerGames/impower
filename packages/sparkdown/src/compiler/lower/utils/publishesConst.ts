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
import { checkerReportsSyntaxAt } from "../../typecheck/LuauUnitNodes";
import type { Location } from "../../typecheck/Location";
import type { LowerContext } from "../context";
import { offsetAt, rangeOf } from "./luauAst";
import { functionBindings, resolveFunctionBinding } from "./functionBindings";
import { makeSource } from "./validateDefineStructure";

/**
 * Whether a `const` lowered here is the story's published constant: one
 * written outside every function, which the story declares with its globals
 * and the compiler reports on itself. A `const` inside a function, at any
 * depth of its blocks, is Luau's: a local of its block that cannot be
 * reassigned. So is one in a Sparkle handler's closure, which runs as a
 * function (`localConsts`), and one in a `run` file, whose text is the body
 * of the function a `run` calls.
 */
export function publishesConst(ctx: LowerContext): boolean {
  return !ctx.functionScopeStack?.length && !ctx.localConsts;
}

/**
 * Reports one of Luau's errors for a `const` of a function (a name with no
 * value, a reassignment), in Luau's words at Luau's range (`location`, from
 * the converter's AST), where the type checker does not report it
 * (`checkerReportsSyntaxAt`): a function value in an interpolation of the
 * story or of a double-quoted string, a define's method or property, a
 * Sparkle handler. Where it does, its reading reports the error
 * (`isLuauConst` in `readLuauAst.ts`). A body whose syntax errors the
 * lowering reports itself (`reportBodySyntaxErrors`) leaves out the one
 * reported here at the same place.
 */
export function reportLuauConstError(
  message: string,
  location: Location,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  const range = rangeOf(location, ctx);
  if (checkerReportsSyntaxAt(node, range.from, (from, to) => ctx.read(from, to))) return;
  ctx.diagnostics?.push({
    message,
    severity: ErrorType.Error,
    source: makeSource(range.from, range.to, ctx),
  });
}

/**
 * The const a target reassigns, when the converter read the target as
 * Luau's error around a `const`'s name (an assignment's target, a compound
 * assignment's, a function statement's name), or undefined.
 */
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

/**
 * Reports Luau's error for a target that reassigns a function's `const`
 * (`reportLuauConstError`), decided by the functions lowering around it:
 * a name the target's own reading binds to a const, or one it reads as a
 * global that an enclosing function binds to a const there
 * (`resolveFunctionBinding`), which a body read on its own (a nested
 * function, a define's property or method, a Sparkle handler) cannot see.
 * In story text the const is the published constant, whose reassignment the
 * compiler reports in its own words.
 */
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

/**
 * Reports Luau's missing initializer for a function's `const` with more
 * names than values and no call or `...` last to give the rest
 * (`reportLuauConstError`). A published constant's is the compiler's own.
 */
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

/**
 * Reports Luau's const errors in the function bodies no code is lowered for,
 * so neither reporter would otherwise reach them: a function a type holds
 * (`typeof(function() ... end)` in a type alias, an annotation, a cast or a
 * generic default), its signature's types included, and a type function's
 * body. Each is checked as it would be lowered (`reportReassignedConst`,
 * `reportMissingConstInitializer`) against the bindings around it, with its
 * own pushed; a type function sees none of the locals outside it, as Luau
 * reads it, so it is checked against its own alone. `root` is the function
 * whose body has lowered, while its bindings are still on
 * `functionBindingsStack`; a function value in its code lowers, and is
 * checked, on its own.
 */
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
    // The function itself, so its parameter, vararg and return types are
    // walked with its body.
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
      // A type function's body is erased, unlike a function value's.
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
