import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatRepeat } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { untilKeywordOf } from "../utils/validateBlockEnds";
import { syntheticId } from "../utils/documentTag";
import {
  extendStatement,
  recordLoop,
  openBody,
} from "../utils/statementShape";
import { statementNodeAt, unreadStatement, type StatementSite } from "./lowerLuauStatement";

const REPEAT_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauRepeatKeyword",
  "LuauComment",
]);

const REPEAT_NODES = nodeNameSet(["LuauRepeatLoop", "LuauSparkdownRepeatLoop", "LuauSparkdownExplicitRepeatLoop"]);

export function lowerLuauRepeatLoop(
  stat: AstStatRepeat,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, REPEAT_NODES, ctx);
  if (!node) return unreadStatement(stat, site, "repeat", ctx);
  const bodyContent =
    findChildByName(node, `${node.name}_content`) ?? node;
  const untilKeyword = untilKeywordOf(node);
  if (!untilKeyword) return {};
  const condition = findNextUntilSibling(node);
  const condExpr = lowerExpression(stat.condition, site.source, ctx);
  if (!condExpr) return {};

  const id = syntheticId(node.from, ctx);
  const loopLabel = `__repeat_${id}_loop`;
  const continueLabel = `__repeat_${id}_continue`;
  const breakLabel = `__repeat_${id}_break`;

  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  ctx.loopStack?.push({
    continueLabel,
    breakLabel,
    scopeDepth: ctx.scopeDepth,
  });
  const body = openBody(
    ctx,
    node.from,
    bodyContent === node ? node.from : bodyContent.from,
    untilKeyword.from,
  );
  extendStatement(ctx, condition?.to ?? untilKeyword.to);
  const bodyStatements = lowerStatements(
    bodyContent,
    ctx,
    REPEAT_BODY_SKIP,
    body,
  );
  ctx.loopStack?.pop();
  ctx.scopeDepth--;

  const notCond = new UnaryExpression(condExpr as Expression, "not");

  const loopGather = new Gather(new Identifier(loopLabel), 1);
  for (const stmt of bodyStatements) loopGather.AddContent(stmt);
  const toContinue = new Divert([new Identifier(continueLabel)]);
  loopGather.AddContent(toContinue);

  const continueGather = new Gather(new Identifier(continueLabel), 1);
  const toLoop = new Divert([new Identifier(loopLabel)]);
  const loopBackBranch = new ConditionalSingleBranch([toLoop]);
  loopBackBranch.ownExpression = notCond;
  loopBackBranch.isElse = false;
  continueGather.AddContent(
    new Conditional(null as never, [loopBackBranch]),
  );

  const breakGather = new Gather(new Identifier(breakLabel), 1);

  const scoped = wrapInScope([loopGather, continueGather, breakGather]);
  if (body) {
    recordLoop(scoped[0]!, {
      kind: "repeat",
      body,
      objects: scoped,
      test: loopBackBranch,
      init: [],
    }, [loopGather, continueGather, breakGather, toContinue, toLoop]);
  }
  return wrapInWeave(scoped);
}

export function findNextUntilSibling(repeatNode: SyntaxNode): SyntaxNode | null {
  if (!untilKeywordOf(repeatNode)) return null;
  const next = repeatNode.nextSibling;
  return next && isExplicitRuleName(next.name, "LuauUntilCondition") ? next : null;
}
