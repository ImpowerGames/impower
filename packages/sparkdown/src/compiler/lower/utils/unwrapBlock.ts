import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";

// Moves a nested block's diagnostics to `ctx.diagnostics`, where the
// chunk-level annotator collects them. Every site that keeps a nested block's
// content but discards the block itself calls this, or the diagnostics the
// nested lowerer raised are lost.
export function forwardBlockDiagnostics(
  block: CompiledBlock | undefined,
  ctx: LowerContext,
): void {
  if (block?.diagnostics?.length) {
    ctx.diagnostics?.push(...block.diagnostics);
  }
}

// The content of a nested statement's block with its `Weave` wrappers
// unwrapped, so every entry is a leaf statement. The block's diagnostics move
// to `ctx.diagnostics`.
export function unwrapBlockContent(
  block: CompiledBlock | undefined,
  ctx: LowerContext,
): ParsedObject[] {
  forwardBlockDiagnostics(block, ctx);
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
