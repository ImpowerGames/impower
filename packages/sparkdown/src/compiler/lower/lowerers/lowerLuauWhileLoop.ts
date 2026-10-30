import { nodeNameSet } from "../../utils/nodeNameSet";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { NativeFunctionCall } from "../../../runtime/NativeFunctionCall";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatWhile } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { syntheticId } from "../utils/documentTag";
import { findLoopDoBlock } from "../utils/loopDoBlock";
import { openBody, recordLoop } from "../utils/statementShape";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { statementNodeAt, unreadStatement, type StatementSite } from "./lowerLuauStatement";

const WHILE_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauWhileCondition",
  "LuauWhileKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

const WHILE_NODES = nodeNameSet(["LuauWhileLoop", "LuauSparkdownWhileLoop", "LuauSparkdownExplicitLoop"]);

export function lowerLuauWhileLoop(
  stat: AstStatWhile,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, WHILE_NODES, ctx);
  if (!node) return unreadStatement(stat, site, "while", ctx);
  const doBlock = findLoopDoBlock(node, ctx);
  const bodyContent = doBlock
    ? findChildByName(doBlock, `${doBlock.name}_content`)
    : null;
  if (!doBlock) return {};

  const id = syntheticId(node.from, ctx);
  const loopLabel = `__while_${id}_loop`;
  const breakLabel = `__while_${id}_break`;

  const condExpr = lowerExpression(stat.condition, site.source, ctx);

  const outerScopeDepth = ctx.scopeDepth ?? 0;
  ctx.loopStack?.push({
    continueLabel: loopLabel,
    breakLabel,
    scopeDepth: outerScopeDepth,
  });
  const body = openBody(
    ctx,
    node.from,
    bodyContent?.from ?? doBlock.from,
    bodyContent?.to ?? doBlock.to,
  );
  ctx.scopeDepth = outerScopeDepth + 1;
  const bodyStatements = lowerStatements(
    bodyContent,
    ctx,
    WHILE_BODY_SKIP,
    body,
  );
  ctx.scopeDepth = outerScopeDepth;
  ctx.loopStack?.pop();

  const tailDivert = new Divert([new Identifier(loopLabel)]);
  const branch = new ConditionalSingleBranch([
    ...wrapInScope(bodyStatements),
    tailDivert,
  ]);
  if (condExpr) {
    branch.ownExpression = new UnaryExpression(
      condExpr,
      NativeFunctionCall.LuauTruthy,
    );
  }
  branch.isElse = false;
  const conditional = new Conditional(null as never, [branch]);

  const gather = new Gather(new Identifier(loopLabel), 1);
  gather.AddContent(conditional);

  const breakGather = new Gather(new Identifier(breakLabel), 1);

  if (body) {
    recordLoop(gather, {
      kind: "while",
      body,
      objects: [gather, breakGather],
      test: branch,
      init: [],
    }, [gather, breakGather, tailDivert]);
  }

  return wrapInWeave([gather, breakGather]);
}
