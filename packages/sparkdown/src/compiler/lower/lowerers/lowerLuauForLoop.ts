import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";

// `for i = start, stop [, step] do BODY end` — Luau numeric-for.
//
// Compiles to a labeled gather (same pattern as Phase A's while-loop):
//   BeginScope
//     local i = start
//     local __forStop_<off> = stop
//     local __forStep_<off> = step       (defaults to 1)
//     - (__for_<off>_loop)
//       { (__forStep > 0 and i <= __forStop) or (__forStep < 0 and i >= __forStop) :
//         BODY
//         i = i + __forStep
//         -> __for_<off>_loop
//       }
//   EndScope
//
// The scope wrap (BeginScope / EndScope) keeps the loop variable and
// the snapshot stop/step temps from leaking into the enclosing scope.
//
// Snapshot semantics: `stop` and `step` are evaluated ONCE at loop
// entry. Mutating them inside the body doesn't change the loop bound
// or direction. Matches Lua/Luau.
//
// Direction handling: the condition is evaluated at runtime as the
// OR of "step positive AND i in range" / "step negative AND i in
// range". A literal-step compile-time specialization would emit a
// simpler check, but the runtime version is correct in all cases and
// the bytecode overhead is small. Generic `for k, v in iter` is NOT
// handled here — that goes through `lowerLuauGenericForLoop` (Phase D
// generic-for work, separate file).

const FOR_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauForCondition",
  "LuauForKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

export function lowerLuauForLoop(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const condNode = getDescendent("LuauForCondition", nodeRef.node);
  const doBlock = getDescendent("LuauDoBlock", nodeRef.node);
  const bodyContent = doBlock
    ? findChildByName(doBlock, "LuauDoBlock_content")
    : null;
  if (!condNode || !bodyContent) return {};

  // Generic-for (`for k, v in iter do`) shares this grammar node but
  // contains `LuauInKeyword`. Defer it — the iterator protocol gets
  // its own lowerer once Phase D's generic-for step lands.
  if (getDescendent("LuauInKeyword", condNode)) return {};

  const condContent =
    findChildByName(condNode, "LuauForCondition_content") ?? condNode;

  // Extract the loop variable name from the leading LuauAccessPath.
  const varAccess = findChildByName(condContent, "LuauAccessPath");
  if (!varAccess) return {};
  const varNameNode = getDescendent("LuauVariableName", varAccess);
  if (!varNameNode) return {};
  const loopVarName = ctx.read(varNameNode.from, varNameNode.to);

  // Start expression: the RHS of the `=` assignment, packaged into a
  // LuauAssignmentOperation node.
  const opNode = findChildByName(condContent, "LuauAssignmentOperation");
  if (!opNode) return {};
  const startExpr = lowerExpressionFromContainer(opNode, ctx);
  if (!startExpr) return {};

  // Trailing expressions: comma-separated groups appearing after the
  // assignment-operation node. Group 0 is `stop`; group 1 (optional)
  // is `step`.
  const trailingGroups = collectTrailingExpressionGroups(opNode);
  const stopExpr =
    trailingGroups[0] && trailingGroups[0].length > 0
      ? lowerExpressionFromNodes(trailingGroups[0], ctx)
      : null;
  if (!stopExpr) return {};
  const stepExpr =
    trailingGroups[1] && trailingGroups[1].length > 0
      ? lowerExpressionFromNodes(trailingGroups[1], ctx)
      : new NumberExpression(1, "int");

  const stopName = `__forStop_${nodeRef.node.from}`;
  const stepName = `__forStep_${nodeRef.node.from}`;
  const loopLabel = `__for_${nodeRef.node.from}_loop`;

  // Body statements (lowered with the FOR_BODY_SKIP so we don't
  // re-lower the condition or keyword nodes).
  const bodyStatements = lowerStatements(bodyContent, ctx, FOR_BODY_SKIP);

  // i = i + step
  const stepUpdate = new VariableAssignment({
    variableIdentifier: new Identifier(loopVarName),
    assignedExpression: buildAdd(loopVarName, stepName),
  });

  // -> loopLabel
  const tailDivert = new Divert([new Identifier(loopLabel)]);

  // Condition: (step > 0 and i <= stop) or (step < 0 and i >= stop).
  const condExpr = buildLoopCondition(loopVarName, stopName, stepName);

  const branch = new ConditionalSingleBranch([
    ...bodyStatements,
    stepUpdate,
    tailDivert,
  ]);
  branch.ownExpression = condExpr;
  branch.isElse = false;
  const conditional = new Conditional(null as never, [branch]);

  const gather = new Gather(new Identifier(loopLabel), 1);
  gather.AddContent(conditional);

  // Init: local declarations for the loop variable and the snapshot
  // stop / step bindings. These run once at loop entry.
  const initLoopVar = new VariableAssignment({
    variableIdentifier: new Identifier(loopVarName),
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
    initLoopVar,
    initStop,
    initStep,
    gather,
  ]);
  return wrapInWeave(scoped);
}

// Walks `LuauForCondition_content` siblings after the
// LuauAssignmentOperation, splitting on `LuauCommaSeparator` to
// collect groups of expression nodes. Returns `[[stop-nodes],
// [step-nodes]?]`.
function collectTrailingExpressionGroups(opNode: SyntaxNode): SyntaxNode[][] {
  const groups: SyntaxNode[][] = [];
  let current: SyntaxNode[] = [];
  let n: SyntaxNode | null = opNode.nextSibling;
  while (n) {
    if (n.name === "LuauCommaSeparator") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else if (!isSkippable(n.name)) {
      current.push(n);
    }
    n = n.nextSibling;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function isSkippable(name: string): boolean {
  return (
    name === "Newline" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "ExtraWhitespace" ||
    name === "LuauComment"
  );
}

// Build `loopVar + stepName` as a BinaryExpression.
function buildAdd(loopVar: string, stepName: string): Expression {
  return new BinaryExpression(
    new VariableReference([new Identifier(loopVar)]),
    new VariableReference([new Identifier(stepName)]),
    "+",
  );
}

// Build the per-iteration condition:
//   (step > 0 and i <= stop) or (step < 0 and i >= stop)
// Evaluated at runtime; correct for any sign of step.
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
  const stepNegative = new BinaryExpression(
    new VariableReference([new Identifier(stepName)]),
    new NumberExpression(0, "int"),
    "<",
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
  const negativeCase = new BinaryExpression(stepNegative, iGeStop, "and");
  return new BinaryExpression(positiveCase, negativeCase, "or");
}
