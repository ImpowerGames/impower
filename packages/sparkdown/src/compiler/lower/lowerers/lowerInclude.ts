import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";

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
