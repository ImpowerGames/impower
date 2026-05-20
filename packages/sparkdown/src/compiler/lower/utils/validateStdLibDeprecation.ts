import { type SyntaxNode } from "@lezer/common";
import { ErrorType, SourceMetadata } from "../../../inkjs/engine/Error";
import { lookupStdLibDeprecation } from "../../../inkjs/engine/StdLib";
import { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { LowerContext } from "../context";

// LSP `DiagnosticTag.Deprecated`. VS Code renders the affected range
// with a strikethrough so deprecated calls are visually marked
// without breaking the build.
const DIAGNOSTIC_TAG_DEPRECATED = 2;

// If `resolvedName` matches a stdlib entry flagged `deprecated`,
// push an Information-severity diagnostic onto `ctx.diagnostics`
// covering `node`'s range. The runtime still dispatches the call —
// the diagnostic is purely editor-side feedback. No-op otherwise.
export function validateStdLibDeprecation(
  resolvedName: string,
  node: SyntaxNode,
  ctx: LowerContext,
): void {
  const message = lookupStdLibDeprecation(resolvedName);
  if (!message || !ctx.diagnostics) return;
  ctx.diagnostics.push({
    message,
    severity: ErrorType.Information,
    source: makeSource(node, ctx),
    tags: [DIAGNOSTIC_TAG_DEPRECATED],
  });
}

function makeSource(node: SyntaxNode, ctx: LowerContext): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(node.from) + 1,
    endLineNumber: ctx.lineNumber(node.to) + 1,
    startCharacterNumber: ctx.characterNumber(node.from) + 1,
    endCharacterNumber: ctx.characterNumber(node.to) + 1,
  };
}
