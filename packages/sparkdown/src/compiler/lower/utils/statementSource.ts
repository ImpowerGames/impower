import type { SourceMetadata } from "../../../inkjs/engine/Error";
import type { LowerContext } from "../context";

// The source of a diagnostic reported on a whole statement. A statement's
// node starts at the beginning of its line, indentation included, so the
// leading spaces and tabs are skipped: the range starts at the statement's
// first character, and an editor underlines the statement rather than its
// indentation.
export function statementSource(
  node: { from: number; to: number },
  ctx: LowerContext,
): SourceMetadata {
  const text = ctx.read(node.from, node.to);
  const indentation = text.length - text.replace(/^[ \t]+/, "").length;
  const from = node.from + indentation;
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(from) + 1,
    endLineNumber: ctx.lineNumber(node.to) + 1,
    startCharacterNumber: ctx.characterNumber(from) + 1,
    endCharacterNumber: ctx.characterNumber(node.to) + 1,
  };
}
