import { Glue as RuntimeGlue } from "../../../inkjs/engine/Glue";
import { Glue as ParsedGlue } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Glue";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

// Sparkdown's `..` glue marker. The grammar's `Glue` rule recognizes
// `<space>..<space>` (preceded by start-of-line or whitespace, followed by
// end-of-line or whitespace) — distinguishing it from Luau's `..` string-
// concatenation operator (which appears between non-whitespace operands).
//
// The runtime `Glue` is an output-stream marker that tells the renderer to
// suppress the newline that would otherwise sit between the previous and
// following content. Functionally equivalent to ink's `<>` glue operator:
// `{true: a} <> b` emits `"a b\n"` rather than `"a\nb\n"`.
export function lowerGlue(
  _nodeRef: SparkdownSyntaxNodeRef,
  _ctx: LowerContext,
): CompiledBlock {
  return wrapInWeave([new ParsedGlue(new RuntimeGlue())]);
}
