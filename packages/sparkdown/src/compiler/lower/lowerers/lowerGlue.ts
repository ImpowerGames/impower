import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { reportLeadingGlue } from "./lowerDisplay";

// A `..` reached as a statement of its own is a bare `..` line: it leads no
// text, and only a `..` that ends a line joins the next one, which the display
// lowerer marks `open` on that line's call. The line is reported and lowers to
// nothing.
export function lowerGlue(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  reportLeadingGlue(nodeRef.node, ctx);
  return {};
}
