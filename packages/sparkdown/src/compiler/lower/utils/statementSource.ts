import type { SourceMetadata } from "../../../runtime/Error";
import type { LowerContext } from "../context";

export function statementSource(
  node: { from: number; to: number },
  ctx: LowerContext,
): SourceMetadata {
  const text = ctx.read(node.from, node.to);
  // value-level: the statement text, measuring its indentation
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
