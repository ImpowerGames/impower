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
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { statementNodeAt, unreadStatement, type StatementSite } from "./lowerLuauStatement";
import { syntheticId } from "../utils/documentTag";
import { findLoopDoBlock } from "../utils/loopDoBlock";
import { openBody, recordLoop } from "../utils/statementShape";

const FOR_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauForCondition",
  "LuauForKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

const FOR_NODES = nodeNameSet(["LuauForLoop", "LuauSparkdownForLoop", "LuauSparkdownExplicitLoop"]);

export function lowerLuauForLoop(
  stat: AstStatFor,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, FOR_NODES, ctx);
  if (!node) return unreadStatement(stat, site, "for", ctx);
  const doBlock = findLoopDoBlock(node, ctx);
  const bodyContent = doBlock
    ? findChildByName(doBlock, `${doBlock.name}_content`)
    : null;
  if (!doBlock) return {};

  const loopVarName = stat.variable.name;
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

  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  ctx.loopStack?.push({
    continueLabel: stepLabel,
    breakLabel,
    scopeDepth: ctx.scopeDepth,
  });
  const body = openBody(
    ctx,
    node.from,
    bodyContent?.from ?? doBlock.from,
    bodyContent?.to ?? doBlock.to,
  );
  const bodyStatements = lowerStatements(
    bodyContent,
    ctx,
    FOR_BODY_SKIP,
    body,
  );
  ctx.loopStack?.pop();
  ctx.scopeDepth--;

  const condExpr = buildLoopCondition(idxName, stopName, stepName);

  const copyLoopVar = new VariableAssignment({
    variableIdentifier: new Identifier(loopVarName),
    assignedExpression: new VariableReference([new Identifier(idxName)]),
    isTemporaryNewDeclaration: true,
  });

  const toStep = new Divert([new Identifier(stepLabel)]);
  const branch = new ConditionalSingleBranch([
    copyLoopVar,
    ...bodyStatements,
    toStep,
  ]);
  branch.ownExpression = condExpr;
  branch.isElse = false;
  const conditional = new Conditional(null as never, [branch]);

  const loopGather = new Gather(new Identifier(loopLabel), 1);
  loopGather.AddContent(conditional);
  const toBreak = new Divert([new Identifier(breakLabel)]);
  loopGather.AddContent(toBreak);

  const stepGather = new Gather(new Identifier(stepLabel), 1);
  stepGather.AddContent(
    new VariableAssignment({
      variableIdentifier: new Identifier(idxName),
      assignedExpression: buildAdd(idxName, stepName),
    }),
  );
  const toLoop = new Divert([new Identifier(loopLabel)]);
  stepGather.AddContent(toLoop);

  const breakGather = new Gather(new Identifier(breakLabel), 1);

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
    recordLoop(scoped[0]!, {
      kind: "for",
      body,
      objects: scoped,
      test: branch,
      init: [initIdx, initStop, initStep],
      copy: copyLoopVar,
      step: stepGather.content[0] as VariableAssignment,
    }, [loopGather, stepGather, breakGather, toStep, toBreak, toLoop]);
  }
  return wrapInWeave(scoped);
}

function buildAdd(loopVar: string, stepName: string): Expression {
  return new BinaryExpression(
    new VariableReference([new Identifier(loopVar)]),
    new VariableReference([new Identifier(stepName)]),
    "+",
  );
}

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
