import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { buildDivert } from "../utils/buildDivert";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerDivert(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const objects = buildDivert(nodeRef.node, ctx);
  const block = wrapInWeave(objects);
  // `->` with no target outside of a choice is meaningless — there's
  // nothing to divert to. Inkjs's parser emits the same diagnostic.
  // Inside a choice, `* ->` is the fallback-choice form and `lowerChoice`
  // handles it (no diagnostic), so we only fire here at the top level.
  if (objects.length === 0) {
    const hasTarget = !!getDescendent("DivertTarget", nodeRef.node);
    const hasTunnelMark = !!getDescendent("TunnelMark", nodeRef.node);
    if (!hasTarget && !hasTunnelMark) {
      block.diagnostics = [
        {
          message:
            "Empty diverts (->) are only valid on choices (e.g. `* ->`).",
          severity: ErrorType.Warning,
          source: {
            fileName: null,
            filePath: ctx.filePath ?? null,
            startLineNumber: ctx.lineNumber(nodeRef.from) + 1,
            endLineNumber: ctx.lineNumber(nodeRef.to) + 1,
            startCharacterNumber: ctx.characterNumber(nodeRef.from) + 1,
            endCharacterNumber: ctx.characterNumber(nodeRef.to) + 1,
          },
        },
      ];
    }
  }
  return block;
}
