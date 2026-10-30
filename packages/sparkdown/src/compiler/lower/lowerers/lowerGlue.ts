import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";

export function lowerGlue(
  _nodeRef: SparkdownSyntaxNodeRef,
  _ctx: LowerContext,
): CompiledBlock {
  return {};
}
