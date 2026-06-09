import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { LowerContext } from "../context";
import { buildDebugMetadata } from "./debugMetadata";

// Wrap the given parsed objects in a statement-level Weave.
//
// When called from a NESTED helper (not through the chunk-level
// `lower()` dispatcher), the resulting Weave won't be automatically
// stamped with per-statement debug metadata — the dispatcher's
// `stampDebugMetadata` only fires for the top-level returned block.
// Callers that DO know the source position can pass `range` + `ctx`
// to attach metadata at wrap time so `appendBlockContent` can carry
// it down to the unwrapped children later.
export function wrapInWeave(
  content: ParsedObject[],
  range?: { from: number; to: number },
  ctx?: LowerContext,
): CompiledBlock {
  if (content.length === 0) {
    return {};
  }
  const weave = new Weave(content);
  if (range && ctx) {
    weave.debugMetadata = buildDebugMetadata(range.from, range.to, ctx);
  }
  return { content: [weave] };
}
