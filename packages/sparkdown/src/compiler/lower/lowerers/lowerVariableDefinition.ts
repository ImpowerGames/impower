import { ErrorType } from "../../../inkjs/engine/Error";
import { ConstantDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import {
  AstStatLocal,
  AstStatSparkdownStore,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { shadowSiblingSubFlow } from "../expression/bindings";
import {
  astIdentifier,
  lowerCallArguments,
  type PathName,
} from "../expression/lowerExpression";
import { rangeOf } from "../utils/luauAst";
import { statementSource } from "../utils/statementSource";
import { validateDefineTypeShadow } from "../utils/validateDefineTypeShadow";
import { wrapInWeave } from "../utils/wrapInWeave";
import type { StatementSite } from "./lowerLuauStatement";

/**
 * A declaration: `local` names (a temporary of the enclosing flow or
 * function), `store` names (globals the story saves, registered at the story
 * level and evaluated at its start) and a `const` (a global that does not
 * change). The validators of the declaration's syntax node report what its
 * list leaves missing (`validateVariableDefinition`).
 */
export function lowerVariableDefinition(
  stat: AstStatLocal | AstStatSparkdownStore,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const scope =
    stat instanceof AstStatSparkdownStore
      ? "store"
      : stat.isConst
        ? "const"
        : "local";
  const targets: PathName[] =
    stat instanceof AstStatLocal
      ? stat.vars.map((v) => ({ name: v.name, location: v.location }))
      : stat.vars.map((v) => ({ name: v.name, location: v.location }));
  if (targets.length === 0) return {};
  const hasEquals = stat.equalsSignLocation !== undefined;

  // Global declarations (`store` / `const`) that reuse a define TYPE name
  // shadow the type's bare Luau global — warn. `local` is exempt: lexical
  // shadowing inside a function body is ordinary Luau and expected.
  if (scope === "store" || scope === "const") {
    for (const t of targets) {
      validateDefineTypeShadow(t.name, rangeOf(t.location, ctx), ctx);
    }
  }

  // `local f = ...` over a name that statically referred to a sibling
  // variadic subflow (`function f(...)` earlier in this function):
  // the local SHADOWS the subflow from here on, lexically — drop the
  // registry entries so later `f` references and calls resolve as the
  // variable instead of emitting diverts to the knot (math.luau line
  // 503's `local v,f = math.modf(...)` after the chunk-level
  // `function f(...)`; the stale value-ref produced an unresolvable
  // DivertTarget that crashed JSON serialization). Mirrors
  // lowerReassignment's rebind handling — registry consulted in
  // lexical order, so earlier call sites keep the knot binding.
  if (ctx.siblingSubFlowNamesStack) {
    for (const t of targets) {
      for (const frame of ctx.siblingSubFlowNamesStack) {
        frame.delete(t.name);
      }
    }
  }

  const expressions = lowerCallArguments(stat.values, site.source, ctx);
  const targetIdentifiers = targets.map((t) => astIdentifier(t, ctx));
  const lastIdentifier = targetIdentifiers[targetIdentifiers.length - 1]!;

  // `const x = expr` — must be single-target, single-RHS. Reject
  // multi-target const and multi-RHS const with an error on the
  // declaration; without it every read of the undeclared name is
  // silently nil.
  if (scope === "const") {
    const range = rangeOf(stat.location, ctx);
    if (targets.length > 1 || expressions.length > 1) {
      ctx.diagnostics?.push({
        message: "A `const` takes one name and one value",
        severity: ErrorType.Error,
        source: statementSource(range, ctx),
      });
    } else if (expressions.length === 0 && !hasEquals) {
      ctx.diagnostics?.push({
        message: "Missing initializer in const declaration",
        severity: ErrorType.Error,
        source: statementSource(range, ctx),
      });
    }
    if (targets.length !== 1 || expressions.length !== 1) return {};
    return wrapInWeave([
      new ConstantDeclaration(lastIdentifier, expressions[0]!),
    ]);
  }

  // Multi-target. Two paths:
  //
  //   `local a, b = …`  → route through `MultiVariableAssignment` so
  //   the runtime gets a proper `PackTuple` + `UnpackTuple` sequence —
  //   handles both multi-RHS positional and single-RHS multi-return.
  //
  //   `store a, b = …`  → synthesize one `VariableAssignment` per
  //   target with the positionally-corresponding expression (missing
  //   slots get no expression, which defaults to 0 at story init).
  //   Globals don't emit procedural runtime objects — they register
  //   at the story level and the story evaluates each expression at
  //   init time, so the `MultiVariableAssignment` Pack/Unpack flow
  //   doesn't apply. Single-RHS multi-return into multi-target globals
  //   (`store a, b = f()`) takes only f()'s first value — to fully
  //   unpack, authors should use a local intermediate.
  if (targets.length > 1) {
    if (scope === "local") {
      // No value (`local a, b`, or `local a, b =` whose value the parser
      // could not read, which the type checker reports): give UnpackTuple
      // one NullExpression to unpack — it pads the remaining slots with
      // nil. With zero expressions it would pop whatever happened to be on
      // the eval stack. The names are still declared, so the statements
      // after them read and assign these locals.
      const multiExprs =
        expressions.length === 0 ? [new NullExpression()] : expressions;
      // Each local hides a variadic function of its name for the rest of
      // its block, the statements after it on its line included.
      for (const target of targetIdentifiers) {
        if (target.name) shadowSiblingSubFlow(target.name, ctx);
      }
      return wrapInWeave([
        new MultiVariableAssignment(targetIdentifiers, multiExprs, true),
      ]);
    }
    return wrapInWeave(
      targetIdentifiers.map(
        (identifier, i) =>
          new VariableAssignment({
            variableIdentifier: identifier,
            assignedExpression: expressions[i] ?? undefined,
            isGlobalDeclaration: true,
          }),
      ),
    );
  }

  // Single target. If there are multiple RHS expressions (`local x = a, b`),
  // Lua truncates to the first value.
  //
  // A local with no value (`local x`, or `local x =` whose value the
  // parser could not read, which the type checker reports) gets a
  // synthesized `NullExpression`, so the runtime gets a `NullValue` pushed
  // before the `RuntimeVariableAssignment`. Without it, the binding
  // bytecode would pop whatever happened to be on the eval stack, or
  // nothing, and the local would hold no value at all. A `store` with no
  // value is a global declaration, which the story initializes itself.
  const isTemp = scope === "local";
  const expr =
    expressions[0] ??
    (isTemp || !hasEquals ? new NullExpression() : null);
  const va = new VariableAssignment({
    variableIdentifier: lastIdentifier,
    assignedExpression: expr ?? undefined,
    isGlobalDeclaration: scope === "store",
    isTemporaryNewDeclaration: isTemp,
  });
  // A local hides a variadic function of its name for the rest of its
  // block, the statements after it on its line included.
  if (isTemp && lastIdentifier.name) {
    shadowSiblingSubFlow(lastIdentifier.name, ctx);
  }
  return wrapInWeave([va]);
}
