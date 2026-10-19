import type { SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../runtime/Error";
import { AstExprError, AstExprLocal, type AstExpr } from "../../typecheck/Ast";
import { isCheckedLuauAt } from "../../typecheck/LuauUnitNodes";
import type { Location } from "../../typecheck/Location";
import type { LowerContext } from "../context";
import { rangeOf } from "./luauAst";
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
 * the converter's AST), where the type checker does not read the Luau: a
 * function value in an interpolation, a define's method or property, a
 * Sparkle handler. Where it does read it, its reading reports the error
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
  if (isCheckedLuauAt(node, range.from, (from, to) => ctx.read(from, to))) return;
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
 * (`reportLuauConstError`). In story text the const is the published
 * constant, whose reassignment the compiler reports in its own words.
 */
export function reportReassignedConst(
  target: AstExpr,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  const local = reassignedConstName(target);
  if (!local || publishesConst(ctx)) return;
  reportLuauConstError(
    `Variable '${local.local.name}' is constant and may not be reassigned`,
    local.location,
    node,
    ctx,
  );
}
