import { nodeNameSet } from "../../utils/nodeNameSet";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatFor } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { shadowSiblingSubFlow } from "../expression/bindings";
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";
import { syntheticId } from "../utils/documentTag";
import { findLoopDoBlock } from "../utils/loopDoBlock";
import { loopOf, openBody } from "../utils/statementShape";

// `for i = start, stop [, step] do BODY end` — Luau numeric-for.
//
// Compiles to a labeled gather (same pattern as Phase A's while-loop):
//   BeginScope
//     local __forIdx_<off> = start       (HIDDEN internal index)
//     local __forStop_<off> = stop
//     local __forStep_<off> = step       (defaults to 1)
//     - (__for_<off>_loop)
//       { (__forStep > 0 and __forIdx <= __forStop) or ((not (__forStep > 0)) and __forIdx >= __forStop) :
//         local i = __forIdx              (fresh user-visible copy)
//         BODY
//         -> __for_<off>_step
//       }
//       -> __for_<off>_break
//     - (__for_<off>_step)
//       __forIdx = __forIdx + __forStep
//       -> __for_<off>_loop
//     - (__for_<off>_break)
//   EndScope
//
// `<off>` is `syntheticId`: the document tag, `$`, then the loop's offset in
// the document. The rename pass recognizes these names by that `$`.
//
// The scope wrap (BeginScope / EndScope) keeps the loop variable and
// the snapshot index/stop/step temps from leaking into the enclosing
// scope.
//
// Hidden-index semantics (Lua): iteration is driven by an internal
// index the body can't see. The user variable is a fresh COPY each
// iteration, so `b = nil` inside the body neither breaks the step
// arithmetic nor affects how many times the loop runs (basic.luau
// line 188).
//
// Snapshot semantics: `stop` and `step` are evaluated ONCE at loop
// entry. Mutating them inside the body doesn't change the loop bound
// or direction. Matches Lua/Luau.
//
// Direction handling (Luau): `step > 0` selects the forward check
// (`idx <= stop`); EVERYTHING ELSE — negative, zero, and nan steps —
// uses the backward check (`idx >= stop`). That's why the second arm
// is `not (step > 0)` rather than `step < 0`: `for i=10,1,0` must
// iterate (backward check 10 >= 1 holds, index never advances —
// broken out by the body), and a nan step iterates exactly once when
// start >= stop (basic.luau lines 194-211). A nan INDEX also exits:
// both comparisons are false against nan (lines 214-215). Generic
// `for k, v in iter` is NOT handled here — that goes through
// `lowerLuauGenericForLoop`.

const FOR_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauForCondition",
  "LuauForKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

const FOR_NODES = nodeNameSet(["LuauForLoop", "LuauSparkdownForLoop"]);

export function lowerLuauForLoop(
  stat: AstStatFor,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, FOR_NODES, ctx);
  if (!node) return {};
  const doBlock = findLoopDoBlock(node, ctx);
  // An EMPTY body (`for i = 1, 3 do end`) has no `_content` child —
  // the loop must still lower: its bounds evaluate (and can raise).
  // `lowerStatements(null)` yields [].
  const bodyContent = doBlock
    ? findChildByName(doBlock, `${doBlock.name}_content`)
    : null;
  if (!doBlock) return {};

  const loopVarName = stat.variable.name;
  // Lua numeric-for coerces string bounds to numbers
  // (`for i="10","1","-2"` — iter.luau line 30). Wrap each bound in
  // `tonumber(...)`: numbers pass through, numeric strings coerce,
  // and anything else becomes nil — which the loop condition's
  // comparison then rejects with a runtime error instead of looping
  // forever on string arithmetic. Statically-numeric bounds
  // (literals, negated literals) skip the wrap — they can't need
  // coercion.
  const staticallyNumeric = (e: Expression): boolean =>
    e instanceof NumberExpression ||
    (e instanceof UnaryExpression &&
      e.innerExpression instanceof NumberExpression);
  const coerce = (e: Expression): Expression =>
    staticallyNumeric(e)
      ? e
      : new FunctionCall(new Identifier("tonumber"), [e]);
  const rawStartExpr = lowerExpression(stat.from, site.source, ctx);
  if (!rawStartExpr) return {};
  const startExpr = coerce(rawStartExpr);
  const rawStopExpr = lowerExpression(stat.to, site.source, ctx);
  if (!rawStopExpr) return {};
  const stopExpr = coerce(rawStopExpr);
  const stepExpr = stat.step
    ? coerce(lowerExpression(stat.step, site.source, ctx) ?? new NumberExpression(1, "int"))
    : new NumberExpression(1, "int");

  const id = syntheticId(node.from, ctx);
  const idxName = `__forIdx_${id}`;
  const stopName = `__forStop_${id}`;
  const stepName = `__forStep_${id}`;
  const loopLabel = `__for_${id}_loop`;
  const stepLabel = `__for_${id}_step`;
  const breakLabel = `__for_${id}_break`;

  // `continue` should perform the step and loop back, so its target
  // is the step-update label, not the loop's head. The body runs
  // inside the loop's own scope wrap — count it in `scopeDepth` so
  // `break`/`continue` inside nested scoped blocks know how many
  // EndScopes to emit before diverting.
  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  ctx.loopStack?.push({
    continueLabel: stepLabel,
    breakLabel,
    scopeDepth: ctx.scopeDepth,
  });
  const body = openBody(
    ctx,
    bodyContent?.from ?? doBlock.from,
    bodyContent?.to ?? doBlock.to,
  );
  // The loop's variable is a local of its body: it hides a variadic
  // function of its name there (`shadowSiblingSubFlow`), from a block of
  // its own that ends with the body.
  ctx.blockEndStack?.push([]);
  shadowSiblingSubFlow(loopVarName, ctx);
  const bodyStatements = lowerStatements(
    bodyContent,
    ctx,
    FOR_BODY_SKIP,
    body,
  );
  ctx.blockEndStack?.pop()?.forEach((end) => end());
  ctx.loopStack?.pop();
  ctx.scopeDepth--;

  // Condition drives the HIDDEN index, not the user variable.
  const condExpr = buildLoopCondition(idxName, stopName, stepName);

  // Each iteration starts by copying the hidden index into the
  // user-visible loop variable — body writes to it can't affect
  // iteration (Lua semantics, basic.luau line 188).
  const copyLoopVar = new VariableAssignment({
    variableIdentifier: new Identifier(loopVarName),
    assignedExpression: new VariableReference([new Identifier(idxName)]),
    isTemporaryNewDeclaration: true,
  });

  // The body's natural fall-through goes to the step-update label;
  // `continue` also targets it. `break` targets `breakLabel`.
  const branch = new ConditionalSingleBranch([
    copyLoopVar,
    ...bodyStatements,
    new Divert([new Identifier(stepLabel)]),
  ]);
  branch.ownExpression = condExpr;
  branch.isElse = false;
  const conditional = new Conditional(null as never, [branch]);

  // Loop gather: runs the conditional; when cond is false the
  // explicit divert past the conditional sends control to the break
  // label, skipping the step-update entirely.
  const loopGather = new Gather(new Identifier(loopLabel), 1);
  loopGather.AddContent(conditional);
  loopGather.AddContent(new Divert([new Identifier(breakLabel)]));

  // Step gather: increment the hidden index then divert back to the
  // loop head. Only reachable from the body (via natural fall-through
  // or `continue`).
  const stepGather = new Gather(new Identifier(stepLabel), 1);
  stepGather.AddContent(
    new VariableAssignment({
      variableIdentifier: new Identifier(idxName),
      assignedExpression: buildAdd(idxName, stepName),
    }),
  );
  stepGather.AddContent(new Divert([new Identifier(loopLabel)]));

  // Break gather: sentinel for natural loop exit and `break` divert.
  const breakGather = new Gather(new Identifier(breakLabel), 1);

  // Init: local declarations for the hidden index and the snapshot
  // stop / step bindings. These run once at loop entry.
  const initIdx = new VariableAssignment({
    variableIdentifier: new Identifier(idxName),
    assignedExpression: startExpr,
    isTemporaryNewDeclaration: true,
  });
  const initStop = new VariableAssignment({
    variableIdentifier: new Identifier(stopName),
    assignedExpression: stopExpr,
    isTemporaryNewDeclaration: true,
  });
  const initStep = new VariableAssignment({
    variableIdentifier: new Identifier(stepName),
    assignedExpression: stepExpr,
    isTemporaryNewDeclaration: true,
  });

  const scoped = wrapInScope([
    initIdx,
    initStop,
    initStep,
    loopGather,
    stepGather,
    breakGather,
  ]);
  if (body) {
    loopOf.set(scoped[0]!, {
      kind: "for",
      body,
      objects: scoped,
      test: branch,
      init: [initIdx, initStop, initStep],
      copy: copyLoopVar,
      step: stepGather.content[0] as VariableAssignment,
    });
  }
  return wrapInWeave(scoped);
}

// Build `loopVar + stepName` as a BinaryExpression.
function buildAdd(loopVar: string, stepName: string): Expression {
  return new BinaryExpression(
    new VariableReference([new Identifier(loopVar)]),
    new VariableReference([new Identifier(stepName)]),
    "+",
  );
}

// Build the per-iteration condition (Luau semantics):
//   (step > 0 and idx <= stop) or ((not (step > 0)) and idx >= stop)
// `step > 0` selects the forward check; EVERYTHING ELSE — negative,
// zero, and nan steps — uses the backward check. `not (step > 0)`
// (rather than `step < 0`) is what makes zero/nan steps iterate when
// start >= stop, matching Luau (basic.luau lines 194-211). Both
// comparisons are false when the INDEX itself is nan, so the loop
// exits (lines 214-215).
function buildLoopCondition(
  loopVar: string,
  stopName: string,
  stepName: string,
): Expression {
  const stepPositive = new BinaryExpression(
    new VariableReference([new Identifier(stepName)]),
    new NumberExpression(0, "int"),
    ">",
  );
  const stepNotPositive = new UnaryExpression(
    new BinaryExpression(
      new VariableReference([new Identifier(stepName)]),
      new NumberExpression(0, "int"),
      ">",
    ),
    "not",
  );
  const iLeStop = new BinaryExpression(
    new VariableReference([new Identifier(loopVar)]),
    new VariableReference([new Identifier(stopName)]),
    "<=",
  );
  const iGeStop = new BinaryExpression(
    new VariableReference([new Identifier(loopVar)]),
    new VariableReference([new Identifier(stopName)]),
    ">=",
  );
  const positiveCase = new BinaryExpression(stepPositive, iLeStop, "and");
  const backwardCase = new BinaryExpression(stepNotPositive, iGeStop, "and");
  return new BinaryExpression(positiveCase, backwardCase, "or");
}
