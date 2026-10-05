import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { CallValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { StorePropertyAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import {
  AstExpr,
  AstExprError,
  AstExprLocal,
  AstStatAssign,
  AstStatCompoundAssign,
  AstStatExpr,
  binaryOpToString,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import {
  lowerCallArguments,
  lowerExpression,
} from "../expression/lowerExpression";
import { syntheticId } from "../utils/documentTag";
import {
  propertyStore,
  storeTarget,
  targetIdentifier,
} from "../utils/lowerPropertyTargetAssignment";
import { offsetAt } from "../utils/luauAst";
import { wrapInWeave } from "../utils/wrapInWeave";
import type { StatementSite } from "./lowerLuauStatement";

// Assignments, from the converter's AST, bare or after `&`:
//
//   total = total + i             (a name)
//   count += 1                    (compound, desugared to `count = count + 1`)
//   obj.field = value             (a field → StorePropertyAssignment)
//   o:get().a[k] = v              (a field of what a call returns)
//   a, b = b, a                   (several targets, or one with several values)

/** `target = value`, or with several targets or values, the multiple assignment. */
export function lowerAssignment(
  stat: AstStatAssign,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const vars = stat.vars.map(reassignedConst);
  if (vars.length === 1 && stat.values.length <= 1) {
    const value = stat.values[0];
    return lowerSingleAssignment(
      vars[0]!,
      value ? lowerExpression(value, site.source, ctx) : null,
      "=",
      site,
      ctx,
    );
  }
  return lowerMultipleAssignment(vars, stat.values, site, ctx);
}

// A const's name as an assignment target: the converter reads the target as
// Luau's error, which the type checker reports; the compiler reports the
// const's re-assignment with its own wording, so the assignment is lowered
// with its name.
function reassignedConst(target: AstExpr): AstExpr {
  if (
    target instanceof AstExprError &&
    target.expressions.length === 1 &&
    target.expressions[0] instanceof AstExprLocal &&
    target.expressions[0].local.isConst
  ) {
    return target.expressions[0];
  }
  return target;
}

/** `target op= value` (`+=`, `..=`, …), which reads and writes the target once each. */
export function lowerCompoundAssignment(
  stat: AstStatCompoundAssign,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  return lowerSingleAssignment(
    reassignedConst(stat.variable),
    lowerExpression(stat.value, site.source, ctx),
    `${binaryOpToString(stat.op)}=`,
    site,
    ctx,
  );
}

/**
 * A call written as a statement (`foo()`, `obj:method(x)`, the IIFE
 * `(function () ... end)()`): the call runs and the value it returns is
 * popped. Any other expression has no effect as a statement.
 */
export function lowerCallStatement(
  stat: AstStatExpr,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const call = lowerExpression(stat.expr, site.source, ctx);
  if (call instanceof FunctionCall || call instanceof CallValueExpression) {
    call.shouldPopReturnedValue = true;
    return wrapInWeave([call]);
  }
  return {};
}

function lowerSingleAssignment(
  target: AstExpr,
  value: Expression | null,
  opText: string,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  // A value the parser could not read (`x =` with nothing after it), which
  // the type checker reports, assigns nothing: an assignment with no value
  // would take whatever is on the evaluation stack, or nothing, and leave
  // the target holding no value at all.
  if (!value) return {};
  const store = storeTarget(target, site.source, ctx);
  if (store) {
    return wrapInWeave(
      propertyStore(
        store.base,
        store.key,
        value,
        opText,
        offsetAt(target.location.begin, ctx),
        ctx,
      ),
    );
  }
  const identifier = targetIdentifier(target, ctx);
  if (!identifier) return {};
  const variableName = identifier.name ?? "";

  // `f = <expr>` REBINDS the name to a runtime value (Lua's
  // `function f` is itself sugar for this kind of assignment —
  // vararg.luau line 155 reassigns the twice-defined `f` to a fresh
  // function value). For names that are NOT already locals (bare
  // globals and former sibling subflows), record the rebind in the
  // sibling registry — consulted in lexical order during lowering,
  // so earlier call sites keep their original binding:
  //   - any stale subflow entries are dropped (subsequent `f(...)`
  //     must not statically divert to the old knot);
  //   - the `rebound` marker makes subsequent calls value-dispatch
  //     through the variable (CallValueExpression carries the
  //     call-site arg count the runtime needs to pack `...` args)
  //     while still suppressing upval capture — a closure
  //     referencing a bare-assigned GLOBAL (`self = 20` then
  //     `function a.y (x) return x+self end` — calls.luau line 34)
  //     reads the global, it doesn't capture a pointer.
  // Already-local names skip all of this: their dispatch is value-
  // call via declaredLocals anyway, and registering them here would
  // wrongly suppress their upval capture.
  const isKnownLocal =
    ctx.declaredLocalsStack?.some((f) => f.has(variableName)) ?? false;
  if (!isKnownLocal && ctx.siblingSubFlowNamesStack) {
    for (const frame of ctx.siblingSubFlowNamesStack) {
      frame.delete(variableName);
    }
    ctx.siblingSubFlowNamesStack.at(-1)?.set(variableName, {
      upvals: [],
      arity: -1,
      knotName: variableName,
      rebound: true,
    });
  }

  const expr =
    opText === "="
      ? value
      : new BinaryExpression(
          new VariableReference([targetIdentifier(target, ctx)!]),
          value,
          opText.slice(0, -1),
        );
  return wrapInWeave([
    new VariableAssignment({
      variableIdentifier: identifier,
      assignedExpression: expr,
    }),
  ]);
}

// Several targets (`a, b = 10, 20`, `a, b = f()`), or one target with
// several values (`g = 1, bump()`, whose extra values Luau still
// evaluates). Targets that are all names go through one
// `MultiVariableAssignment`. A field among them (`a.x, b = …`,
// `a[f()], b, a[f()+3] = f(), a, 'x'`, attrib.luau lines 13, 15) needs the
// values stashed in temporaries first and a store per target.
function lowerMultipleAssignment(
  vars: readonly AstExpr[],
  values: readonly AstExpr[],
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const expressions = lowerCallArguments(values, site.source, ctx);
  if (expressions.length === 0) return {};
  const names = vars.map((target) => targetIdentifier(target, ctx));
  if (names.every((name) => name !== null)) {
    return wrapInWeave([
      new MultiVariableAssignment(names as Identifier[], expressions, false),
    ]);
  }

  // Mixed shape: stash each RHS slot into a synthetic local, then
  // emit per-target stores. Offset-tagged temp names keep multiple
  // multi-target assignments in the same function body from
  // colliding. The MultiVariableAssignment handles PackTuple +
  // UnpackTuple semantics — including spreading a multi-return f()
  // in the LAST RHS expression across as many temps as we declare.
  const id = syntheticId(offsetAt(vars[0]!.location.begin, ctx), ctx);
  const tempIdents = vars.map((_, i) => new Identifier(`__mt_${id}_${i}`));
  const tempDecl = new MultiVariableAssignment(tempIdents, expressions, true);

  // Lua's "assignments with local conflicts" semantics (basic.luau
  // lines 53-55): ALL expressions — RHS values AND each property
  // target's base + subscript — evaluate before ANY store happens.
  // `local a, b = 1, {} a, b[a] = 43, -1` must store into `b[1]`
  // (the OLD a), not `b[43]`; `a[1], a = 43, -1` must store 43 into
  // the table `a` referenced BEFORE `a` is overwritten with -1. So
  // property targets stash their base + key into temps up front
  // (`preStores`), and the store phase references only temps. As in Luau,
  // whose compiler evaluates complex targets before the values, the bases
  // and keys are taken first, so a call in a target (`t[key()]`) runs before
  // a call among the values (`bump()`).
  const preStores: ParsedObject[] = [];
  const writes: ParsedObject[] = [];
  vars.forEach((target, i) => {
    const tempRef = new VariableReference([tempIdents[i]!]);
    const store = storeTarget(target, site.source, ctx);
    if (store) {
      const baseTemp = new Identifier(`__mt_base_${id}_${i}`);
      const keyTemp = new Identifier(`__mt_key_${id}_${i}`);
      preStores.push(
        new VariableAssignment({
          variableIdentifier: baseTemp,
          assignedExpression: store.base,
          isTemporaryNewDeclaration: true,
        }),
        new VariableAssignment({
          variableIdentifier: keyTemp,
          assignedExpression: store.key,
          isTemporaryNewDeclaration: true,
        }),
      );
      writes.push(
        new StorePropertyAssignment(
          new VariableReference([baseTemp]),
          new VariableReference([keyTemp]),
          tempRef,
        ),
      );
      return;
    }
    const name = names[i];
    if (name) {
      writes.push(
        new VariableAssignment({
          variableIdentifier: name,
          assignedExpression: tempRef,
          isTemporaryNewDeclaration: false,
        }),
      );
    }
  });
  return wrapInWeave([...preStores, tempDecl, ...writes]);
}
