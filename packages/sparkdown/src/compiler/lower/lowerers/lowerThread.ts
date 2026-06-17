import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { buildDivert } from "../utils/buildDivert";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerThread(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const objects = buildDivert(nodeRef.node, ctx, { isThread: true });
  return wrapInWeave(objects);
}
