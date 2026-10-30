import { nodeNameSet } from "../../utils/nodeNameSet";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { CallValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatForIn } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { syntheticId } from "../utils/documentTag";
import { findLoopDoBlock } from "../utils/loopDoBlock";
import { openBody, recordLoop } from "../utils/statementShape";
import { statementNodeAt, unreadStatement, type StatementSite } from "./lowerLuauStatement";

const FOR_IN_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauForCondition",
  "LuauForKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

const FOR_NODES = nodeNameSet(["LuauForLoop", "LuauSparkdownForLoop", "LuauSparkdownExplicitLoop"]);

export function lowerLuauGenericForLoop(
  stat: AstStatForIn,
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

  const loopVarNames = stat.vars.map((v) => v.name);
  if (loopVarNames.length === 0) return {};

  const iterExprs: Expression[] = [];
  for (const value of stat.values) {
    const e = lowerExpression(value, site.source, ctx);
    if (!e) return {};
    iterExprs.push(e);
  }
  if (iterExprs.length === 0) return {};

  const id = syntheticId(node.from, ctx);
  const iterName = `__forIn_${id}_iter`;
  const stateName = `__forIn_${id}_state`;
  const ctrlName = `__forIn_${id}_ctrl`;
  const loopLabel = `__forIn_${id}_loop`;
  const breakLabel = `__forIn_${id}_break`;

  const initTuple = new MultiVariableAssignment(
    [new Identifier(iterName), new Identifier(stateName), new Identifier(ctrlName)],
    iterExprs,
    true,
  );

  const adjustTuple = new MultiVariableAssignment(
    [new Identifier(iterName), new Identifier(stateName), new Identifier(ctrlName)],
    [
      new FunctionCall(new Identifier("__adjust_iter"), [
        new VariableReference([new Identifier(iterName)]),
        new VariableReference([new Identifier(stateName)]),
        new VariableReference([new Identifier(ctrlName)]),
      ]),
    ],
    false,
  );

  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  ctx.loopStack?.push({
    continueLabel: loopLabel,
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
    FOR_IN_BODY_SKIP,
    body,
  );
  ctx.loopStack?.pop();
  ctx.scopeDepth--;

  const iterCall = new CallValueExpression(
    new VariableReference([new Identifier(iterName)]),
    [
      new VariableReference([new Identifier(stateName)]),
      new VariableReference([new Identifier(ctrlName)]),
    ],
  );
  const callAndUnpack = new MultiVariableAssignment(
    loopVarNames.map((n) => new Identifier(n)),
    [iterCall],
    true,
  );

  const firstVarRef = new VariableReference([new Identifier(loopVarNames[0]!)]);
  const isNilCheck = new BinaryExpression(
    firstVarRef,
    new NullExpression(),
    "==",
  );
  const toBreak = new Divert([new Identifier(breakLabel)]);
  const breakBranch = new ConditionalSingleBranch([toBreak]);
  breakBranch.ownExpression = isNilCheck;
  breakBranch.isElse = false;
  const nilCheckConditional = new Conditional(null as never, [breakBranch]);

  const ctrlUpdate = new VariableAssignment({
    variableIdentifier: new Identifier(ctrlName),
    assignedExpression: new VariableReference([
      new Identifier(loopVarNames[0]!),
    ]),
  });

  const tailDivert = new Divert([new Identifier(loopLabel)]);

  const loopGatherContents: ParsedObject[] = [
    callAndUnpack,
    nilCheckConditional,
    ctrlUpdate,
    ...bodyStatements,
    tailDivert,
  ];
  const loopGather = new Gather(new Identifier(loopLabel), 1);
  for (const c of loopGatherContents) loopGather.AddContent(c);

  const breakGather = new Gather(new Identifier(breakLabel), 1);

  const scoped = wrapInScope([initTuple, adjustTuple, loopGather, breakGather]);
  if (body) {
    recordLoop(scoped[0]!, {
      kind: "forIn",
      body,
      objects: scoped,
      test: breakBranch,
      init: [initTuple, adjustTuple],
      call: callAndUnpack,
      update: ctrlUpdate,
    }, [loopGather, breakGather, toBreak, tailDivert]);
  }
  return wrapInWeave(scoped);
}
