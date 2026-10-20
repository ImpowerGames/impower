import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { statementSource } from "../utils/statementSource";

/** What an `include` line reports. A language server's quick fix deletes the
 *  line it is reported on. */
export const INCLUDE_LINE_MESSAGE =
  "Scripts in the project folder are part of the story. Delete this line.";

/**
 * An `include` line includes nothing: every script under the project's
 * folder is already part of the story (#1387). The grammar keeps the line so
 * this error has its range; it lowers to no content.
 */
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
