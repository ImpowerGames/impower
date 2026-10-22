import { ErrorType } from "../../../runtime/Error";
import { ConstantDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import {
  AstExprCall,
  AstExprVarargs,
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
import { offsetAt, rangeOf } from "../utils/luauAst";
import { rootDeclarationSlot } from "../utils/rootLocalReads";
import { publishesConst, reportMissingConstInitializer } from "../utils/publishesConst";
import { statementSource } from "../utils/statementSource";
import { validateDefineTypeShadow } from "../utils/validateDefineTypeShadow";
import { wrapInWeave } from "../utils/wrapInWeave";
import type { StatementSite } from "./lowerLuauStatement";

// The name the converter gives a name it could not read, as Luau's parser
// does (`kParseNameError`).
const MISSING_NAME = "%error-id%";

/**
 * A declaration: `local` names (a temporary of the enclosing flow or
 * function), `store` names (globals the story saves, registered at the story
 * level and evaluated at its start) and a `const` outside every function (a
 * global that does not change). A `const` inside a function is Luau's, and
 * is lowered as a `local`: its names, its values and its errors are Luau's
 * (`publishesConst`). The validators of the declaration's syntax node report
 * what its list leaves missing (`validateVariableDefinition`).
 */
export function lowerVariableDefinition(
  stat: AstStatLocal | AstStatSparkdownStore,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const scope =
    stat instanceof AstStatSparkdownStore
      ? "store"
      : stat.isConst && publishesConst(ctx)
        ? "const"
        : "local";
  // A function's `const` with more names than values, and no call or `...`
  // last to give the rest, is Luau's error on the declaration.
  if (stat instanceof AstStatLocal) reportMissingConstInitializer(stat, site.node, ctx);
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

  // A `local f = ...` over a name that statically referred to a sibling
  // variadic subflow (`function f(...)` earlier in this function) hides
  // the subflow for the rest of its block (`shadowSiblingSubFlow` below),
  // and a local of a function nested in that one hides it there by
  // resolution, the inner frame first (`resolveCallableBinding`): the
  // subflow is reached again after the local's block (math.luau line
  // 503's `local v,f = math.modf(...)` after the chunk-level
  // `function f(...)`). A `store` or published `const` of the name drops
  // the registry entries, as lowerReassignment's rebind does — registry
  // consulted in lexical order, so earlier call sites keep the knot
  // binding.
  if (scope !== "local" && ctx.siblingSubFlowNamesStack) {
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
  //   target with the positionally-corresponding expression (a missing
  //   slot gets a `NullExpression`, so it starts nil as in Lua; the
  //   story's global initialization requires every store to have one).
  //   Globals don't emit procedural runtime objects — they register
  //   at the story level and the story evaluates each expression at
  //   init time, so the `MultiVariableAssignment` Pack/Unpack flow
  //   doesn't apply. A store whose last value is a call with names left
  //   after it (`store a, b = f()`) gives those names the call's further
  //   values, as Luau does: the call's global spreads to them (`spreadTo`),
  //   and the declaration's chunk evaluates the call once and declares
  //   each of them from its values (#1920). A store's values run when the
  //   story starts, outside any function, so a `...` there has no values
  //   to give the names after it, and is an error on the statement (#1325).
  if (targets.length > 1) {
    const last = stat.values[stat.values.length - 1];
    if (
      scope === "store" &&
      stat.values.length < targets.length &&
      last instanceof AstExprVarargs
    ) {
      ctx.diagnostics?.push({
        message:
          "A `store` is set when the story starts, outside any function, where `...` has no values: give each name its own value, or call a function that returns them",
        severity: ErrorType.Error,
        source: statementSource(rangeOf(stat.location, ctx), ctx),
      });
    }
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
      const multi = new MultiVariableAssignment(targetIdentifiers, multiExprs, true);
      markRootDeclarations(multi.targetAssignments, targets, ctx);
      return wrapInWeave([multi]);
    }
    const assignments = targetIdentifiers.map(
      (identifier, i) =>
        new VariableAssignment({
          variableIdentifier: identifier,
          assignedExpression: expressions[i] ?? new NullExpression(),
          isGlobalDeclaration: true,
        }),
    );
    if (
      stat.values.length < targets.length &&
      last instanceof AstExprCall &&
      expressions.length === stat.values.length
    ) {
      assignments[stat.values.length - 1]!.spreadTo = assignments.slice(
        stat.values.length,
      );
    }
    // The values after the last name are evaluated and dropped (#1333).
    assignments[assignments.length - 1]!.Discard(
      expressions.slice(targets.length),
    );
    // A slot of the list with no name (`store , = 1`, `store a,, = 1`) is
    // the reading's syntax error and declares nothing: two of them would be
    // two globals of one name (I-1426).
    const declared = assignments.filter((_, i) => targets[i]!.name !== MISSING_NAME);
    for (const assignment of declared) {
      assignment.spreadTo = assignment.spreadTo.filter((a) => declared.includes(a));
    }
    return wrapInWeave(declared);
  }

  // Single target. If there are multiple RHS expressions (`local x = a, b`),
  // Lua truncates to the first value, but still evaluates the rest
  // (`local x = 1, bump()` calls `bump`), as the multiple assignment does
  // (`lowerReassignment.ts`, `lowerMultipleAssignment`).
  if (scope === "local" && expressions.length > 1) {
    if (lastIdentifier.name) shadowSiblingSubFlow(lastIdentifier.name, ctx);
    const multi = new MultiVariableAssignment([lastIdentifier], expressions, true);
    markRootDeclarations(multi.targetAssignments, [targets[targets.length - 1]!], ctx);
    return wrapInWeave([multi]);
  }
  //
  // A declaration with no value (`local x`, `store x`, or either with an
  // `=` whose value the parser could not read, which the type checker
  // reports) gets a synthesized `NullExpression`. For a local, the runtime
  // gets a `NullValue` pushed before the `RuntimeVariableAssignment`;
  // without it the binding bytecode would pop whatever happened to be on
  // the eval stack. For a store, the story's global initialization
  // requires an expression and refuses to build the program without one.
  const isTemp = scope === "local";
  const va = new VariableAssignment({
    variableIdentifier: lastIdentifier,
    assignedExpression: expressions[0] ?? new NullExpression(),
    isGlobalDeclaration: scope === "store",
    isTemporaryNewDeclaration: isTemp,
  });
  // A store evaluates its values after the first and drops them (#1333).
  if (scope === "store") va.Discard(expressions.slice(1));
  // A local hides a variadic function of its name for the rest of its
  // block, the statements after it on its line included.
  if (isTemp && lastIdentifier.name) {
    shadowSiblingSubFlow(lastIdentifier.name, ctx);
  }
  if (isTemp) markRootDeclarations([va], [targets[targets.length - 1]!], ctx);
  return wrapInWeave([va]);
}

/** Gives each local the declaration makes in the root frame's own scope the
 *  slot that keeps its binding, when that scope declares its name more than
 *  once (`rootDeclarationSlot`, I-1374). */
function markRootDeclarations(
  assignments: readonly VariableAssignment[],
  targets: readonly PathName[],
  ctx: LowerContext,
): void {
  assignments.forEach((assignment, i) => {
    const target = targets[i];
    if (!target || !assignment.isNewTemporaryDeclaration) return;
    assignment.rootSlot = rootDeclarationSlot(target.name, offsetAt(target.location.begin, ctx), ctx);
  });
}
