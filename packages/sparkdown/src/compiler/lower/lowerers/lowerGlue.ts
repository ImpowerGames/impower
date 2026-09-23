import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { reportLeadingGlue } from "./lowerDisplay";

// A `..` reached as a statement of its own stands at the start of its line,
// where it joins nothing: only a `..` that ends a line joins the next one,
// and the display lowerer marks that line's call `open`. The line is reported
// and lowers to nothing.
export function lowerGlue(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  reportLeadingGlue(nodeRef.node, ctx);
  return {};
}
