import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";

export function forwardBlockDiagnostics(
  block: CompiledBlock | undefined,
  ctx: LowerContext,
): void {
  if (block?.diagnostics?.length) {
    ctx.diagnostics?.push(...block.diagnostics);
  }
}

export function unwrapBlockContent(
  block: CompiledBlock | undefined,
): ParsedObject[] {
  const out: ParsedObject[] = [];
  for (const obj of block?.content ?? []) {
    if (obj instanceof Weave) {
      for (const inner of obj.content) out.push(inner);
    } else {
      out.push(obj);
    }
  }
  return out;
}
