import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";

export function lowerInclude(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const includeContentNode = getDescendent("IncludeContent", nodeRef.node);
  if (!includeContentNode) {
    return {};
  }
  const includeFilePath = ctx.read(
    includeContentNode.from,
    includeContentNode.to,
  );
  return { include: includeFilePath };
}
