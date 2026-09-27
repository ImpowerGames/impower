import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import {
  buildDivert,
  divertLoadShapeProblem,
  withDivertLoad,
} from "../utils/buildDivert";
import { statementSource } from "../utils/statementSource";
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
        source: statementSource(nodeRef, ctx),
      },
    ];
  }
  return block;
}
