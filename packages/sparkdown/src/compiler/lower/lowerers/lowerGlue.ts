import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";

// A `..` reached as a statement of its own is a bare `..` line: it has no text
// to join or to be joined, so it lowers to nothing.
export function lowerGlue(
  _nodeRef: SparkdownSyntaxNodeRef,
  _ctx: LowerContext,
): CompiledBlock {
  return {};
}
