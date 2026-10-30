import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import {
  AstStatLocal,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { stampDebugMetadata } from "../utils/debugMetadata";
import { rangeOf } from "../utils/luauAst";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  lowerLuauStatement,
  statementNodeAt,
  type StatementSite,
} from "./lowerLuauStatement";

const EXPLICIT_STATEMENT = nodeNameSet(["LuauSparkdownExplicitStatement", "LuauSparkdownExplicitBlockStatement"]);

export function lowerExplicitStatement(
  stat: AstStatSparkdownExplicit,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const marked = stat.statement;
  const block = lowerLuauStatement(marked, site, ctx);
  const hoisted =
    marked instanceof AstStatSparkdownStore ||
    (marked instanceof AstStatLocal && marked.isConst);
  const weave = block.content?.[0];
  if (weave instanceof Weave && !hoisted) {
    const node = statementNodeAt(stat, site, EXPLICIT_STATEMENT, ctx);
    const range = node
      ? { from: node.from, to: node.from + ctx.read(node.from, node.to).trimEnd().length }
      : rangeOf(stat.location, ctx);
    stampDebugMetadata(weave.content, range.from, range.to, ctx);
  }
  return block;
}
