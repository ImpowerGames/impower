import { nodeNameSet } from "../../utils/nodeNameSet";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatBlock } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { bodyOfBlock, openBody } from "../utils/statementShape";
import { statementNodeAt, unreadStatement, type StatementSite } from "./lowerLuauStatement";

const DO_BLOCK_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauDoKeyword",
  "LuauEndKeyword",
  "LuauComment",
]);

const DO_NODES = nodeNameSet(["LuauDoBlock", "LuauSparkdownDoBlock", "LuauSparkdownExplicitDoBlock"]);

export function lowerLuauDoBlock(
  stat: AstStatBlock,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, DO_NODES, ctx);
  if (!node) return unreadStatement(stat, site, "do", ctx);
  const bodyContent = findChildByName(node, `${node.name}_content`);
  if (!bodyContent) return {};
  const shape = openBody(ctx, node.from, bodyContent.from, bodyContent.to);
  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  const body = lowerStatements(bodyContent, ctx, DO_BLOCK_SKIP, shape);
  ctx.scopeDepth--;
  const scoped = wrapInScope(body);
  if (shape) {
    bodyOfBlock.set(scoped[0]!, shape);
  }
  return wrapInWeave(scoped);
}
