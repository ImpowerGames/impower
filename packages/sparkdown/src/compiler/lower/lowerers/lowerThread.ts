import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import {
  buildDivert,
  divertLoadShapeProblem,
  withDivertLoad,
} from "../utils/buildDivert";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerThread(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const objects = buildDivert(nodeRef.node, ctx, { isThread: true });
  const block = wrapInWeave(withDivertLoad(nodeRef.node, objects, ctx));
  const loadProblem = divertLoadShapeProblem(nodeRef.node);
  if (loadProblem) {
    block.diagnostics = [
      {
        message: loadProblem,
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
  return block;
}
