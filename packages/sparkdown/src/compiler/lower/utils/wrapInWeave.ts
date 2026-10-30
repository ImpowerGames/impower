import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { buildDebugMetadata } from "./debugMetadata";

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
