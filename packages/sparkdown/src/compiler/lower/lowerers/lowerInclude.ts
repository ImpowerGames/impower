import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { statementSource } from "../utils/statementSource";

export const INCLUDE_LINE_MESSAGE =
  "Scripts in the project folder are part of the story. Delete this line.";

export function lowerInclude(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return {
    diagnostics: [
      {
        message: INCLUDE_LINE_MESSAGE,
        severity: ErrorType.Error,
        source: statementSource(nodeRef, ctx),
      },
    ],
  };
}
