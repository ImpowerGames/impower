import { MultiReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/MultiReturnType";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { AstStatReturn } from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { lowerCallArguments } from "../expression/lowerExpression";
import { stampDebugMetadata } from "../utils/debugMetadata";
import { rangeOf } from "../utils/luauAst";
import { wrapInWeave } from "../utils/wrapInWeave";
import type { StatementSite } from "./lowerLuauStatement";

export function lowerLuauReturnStatement(
  stat: AstStatReturn,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const expressions = lowerCallArguments(stat.list, site.source, ctx);
  const returned = expressions.length > 1
    ? new MultiReturnType(expressions)
    : new ReturnType(expressions[0] ?? null);
  const range = rangeOf(stat.location, ctx);
  stampDebugMetadata([returned], range.from, range.to, ctx);
  return wrapInWeave([returned]);
}
