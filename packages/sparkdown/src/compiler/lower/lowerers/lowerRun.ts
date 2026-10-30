import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { SourceMetadata } from "../../../runtime/Error";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { closeQuoteMessage, quotePathMessage } from "../../utils/runOperand";
import type { LowerContext } from "../context";
import { statementBounds } from "../utils/debugMetadata";
import { statementSource } from "../utils/statementSource";

export function lowerRun(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const runContentNode = getDescendent("RunContent", nodeRef.node);
  const quoted = runContentNode
    ? getDescendent("RunQuotedPath", runContentNode)
    : null;
  const unquoted = runContentNode
    ? getDescendent("RunUnquotedPath", runContentNode)
    : null;
  const value = quoted ?? unquoted;
  const raw = value ? ctx.read(value.from, value.to) : "";
  // value-level: the operand's own text, measuring its trailing whitespace
  const written = quoted ? raw.slice(1, -1) : raw.trim();
  const from = value
    ? quoted
      ? value.from
      : value.from + (raw.length - raw.trimStart().length)
    : nodeRef.from;
  const to = value ? from + (quoted ? raw.length : written.length) : nodeRef.to;
  const source: SourceMetadata = {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(from) + 1,
    endLineNumber: ctx.lineNumber(to) + 1,
    startCharacterNumber: ctx.characterNumber(from) + 1,
    endCharacterNumber: ctx.characterNumber(to) + 1,
  };
  // value-level: normalize the extension of the isolated operand.
  const path = written.endsWith(".luau")
    ? written.slice(0, -".luau".length)
    : written;
  if (!path.trim()) {
    return {
      diagnostics: [
        {
          message: "Expected a file path after 'run'.",
          severity: ErrorType.Error,
          source: statementSource(nodeRef, ctx),
        },
      ],
    };
  }
  const error = (message: string): CompiledBlock => ({
    diagnostics: [{ message, severity: ErrorType.Error, source }],
  });
  // value-level: the isolated unquoted operand, whose first character opens
  if (!quoted && /^["']/.test(written)) {
    return error(closeQuoteMessage(written));
  }
  // value-level: the isolated operand, whose slash makes it a path
  if (!quoted && written.includes("/")) {
    return error(quotePathMessage(written));
  }
  const bounds = statementBounds(nodeRef.from, nodeRef.to, ctx);
  const line: SourceMetadata = {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(bounds.from) + 1,
    endLineNumber: ctx.lineNumber(bounds.to) + 1,
    startCharacterNumber: ctx.characterNumber(bounds.from) + 1,
    endCharacterNumber: ctx.characterNumber(bounds.to) + 1,
  };
  return {
    run: { path, written, quote: quoted ? raw[0]! : "", source, line },
  };
}
