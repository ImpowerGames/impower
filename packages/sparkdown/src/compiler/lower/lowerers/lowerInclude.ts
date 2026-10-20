import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { statementSource } from "../utils/statementSource";

export function lowerInclude(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const includeContentNode = getDescendent("IncludeContent", nodeRef.node);
  const includeFilePath = includeContentNode
    ? ctx.read(includeContentNode.from, includeContentNode.to)
    : "";
  if (!includeFilePath.trim()) {
    // `include` with no path includes nothing (#316).
    return {
      diagnostics: [
        {
          message: "Expected a file path after 'include'.",
          severity: ErrorType.Error,
          source: statementSource(nodeRef, ctx),
        },
      ],
    };
  }
  return { include: includeFilePath };
}
