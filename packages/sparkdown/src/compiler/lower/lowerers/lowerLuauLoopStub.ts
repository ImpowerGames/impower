import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";

// Stub lowerer for pure-luau loop constructs: `LuauForLoop`, `LuauWhileLoop`,
// `LuauRepeatLoop`, `LuauDoBlock`. Returns `{}` so the dispatcher swallows the
// chunk without falling through to InkParser.
//
// Ink's runtime has no native loop construct; supporting these requires
// desugaring to conditional + divert patterns (or extending the runtime).
// Deferred until the runtime design is settled. Bodies inside these loops
// currently appear as sibling chunks in the function context and may produce
// surprising output — that's an acceptable failure mode until the design lands.

export function lowerLuauLoopStub(
  _nodeRef: SparkdownSyntaxNodeRef,
  _ctx: LowerContext,
): CompiledBlock {
  return {};
}
