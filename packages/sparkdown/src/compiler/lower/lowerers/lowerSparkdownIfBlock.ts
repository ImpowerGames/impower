import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { NativeFunctionCall } from "../../../runtime/NativeFunctionCall";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { AstStatIf } from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { headerLineRange, stampDebugMetadata } from "../utils/debugMetadata";
import { rangeOf } from "../utils/luauAst";
import {
  bodyOfBlock,
  openBody,
  type BodyShape,
} from "../utils/statementShape";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { statementNodeAt, unreadStatement, type StatementSite } from "./lowerLuauStatement";

const IF_NODES = nodeNameSet(["LuauSparkdownIfBlock", "LuauIfBlock", "LuauSparkdownExplicitIfBlock"]);

export function lowerLuauIfBlock(
  stat: AstStatIf,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, IF_NODES, ctx);
  if (!node) return unreadStatement(stat, site, "if", ctx);
  const prefix = node.name;
  const elseifNodeName = prefix.replace("IfBlock", "ElseifBlock");
  const elseNodeName = prefix.replace("IfBlock", "ElseBlock");

  const content = findChildByName(node, `${prefix}_content`);
  const ifBodySkip = new Set<string>([
    "LuauIfBlockCondition",
    "LuauSparkdownExplicitIfCondition",
    elseifNodeName,
    elseNodeName,
  ]);

  const elseifArms: AstStatIf[] = [];
  let next = stat.elsebody;
  while (next instanceof AstStatIf) {
    elseifArms.push(next);
    next = next.elsebody;
  }

  const branches: ConditionalSingleBranch[] = [];

  const elseifNodes = findDirectChildren(content, elseifNodeName);
  const elseNode = content ? findChildByName(content, elseNodeName) : null;
  const endStart = content?.to ?? node.to;
  const partStarts = [
    ...elseifNodes.map((n) => n.from),
    ...(elseNode ? [elseNode.from] : []),
    endStart,
  ];

  const condNode = content
    ? findChildByName(content, "LuauIfBlockCondition") ?? findChildByName(content, "LuauSparkdownExplicitIfCondition")
    : null;
  const condExpr = lowerExpression(stat.condition, site.source, ctx);
  const mainShape = openBody(
    ctx,
    condNode?.from ?? content?.from ?? node.from,
    condNode?.to ?? content?.from ?? node.from,
    partStarts[0]!,
  );
  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  const mainBody = wrapInScope(
    lowerStatements(content, ctx, ifBodySkip, mainShape),
  );
  ctx.scopeDepth--;
  branches.push(buildBranch(condExpr, mainBody, false, mainShape));

  elseifNodes.forEach((elseifNode, i) => {
    const elseifContent = findChildByName(
      elseifNode,
      `${elseifNodeName}_content`,
    );
    const ec = elseifContent
      ? findChildByName(elseifContent, "LuauElseifBlockCondition") ?? findChildByName(elseifContent, "LuauSparkdownExplicitIfCondition")
      : null;
    const arm = elseifArms[i];
    const ecExpr = arm ? lowerExpression(arm.condition, site.source, ctx) : null;
    if (ecExpr && arm) {
      const range = rangeOf(arm.location, ctx);
      const header = headerLineRange(range.from, range.to, ctx);
      stampDebugMetadata([ecExpr], header.from, header.to, ctx);
    }
    const shape = openBody(
      ctx,
      ec?.from ?? elseifContent?.from ?? elseifNode.from,
      ec?.to ?? elseifContent?.from ?? elseifNode.from,
      partStarts[i + 1]!,
    );
    ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
    const body = wrapInScope(
      lowerStatements(elseifContent, ctx, ELSEIF_BODY_SKIP, shape),
    );
    ctx.scopeDepth--;
    branches.push(buildBranch(ecExpr, body, false, shape));
  });

  if (elseNode) {
    const elseContent = findChildByName(elseNode, `${elseNodeName}_content`);
    const shape = openBody(
      ctx,
      elseNode.from,
      elseContent?.from ?? elseNode.to,
      endStart,
    );
    ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
    const body = wrapInScope(lowerStatements(elseContent, ctx, undefined, shape));
    ctx.scopeDepth--;
    branches.push(buildBranch(null, body, true, shape));
  }

  const conditional = new Conditional(
    null as unknown as Expression,
    branches,
  );
  return wrapInWeave([conditional]);
}

const ELSEIF_BODY_SKIP = nodeNameSet(["LuauElseifBlockCondition", "LuauSparkdownExplicitIfCondition"]);

function buildBranch(
  condition: Expression | null,
  body: ParsedObject[],
  isElse: boolean,
  shape: BodyShape | undefined,
): ConditionalSingleBranch {
  const branch = new ConditionalSingleBranch(body.length > 0 ? body : null);
  if (shape) {
    bodyOfBlock.set(branch, shape);
  }
  if (condition) {
    branch.ownExpression = new UnaryExpression(
      condition,
      NativeFunctionCall.LuauTruthy,
    );
  }
  branch.isElse = isElse;
  branch.isInline = true;
  return branch;
}

function findDirectChildren(
  parent: SyntaxNode | null,
  name: string,
): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  if (!parent) return result;
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) result.push(child);
    child = child.nextSibling;
  }
  return result;
}
