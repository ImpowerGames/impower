import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { SourceMetadata } from "../../../runtime/Error";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { closeQuoteMessage, quotePathMessage } from "../../utils/runOperand";
import type { LowerContext } from "../context";
import { statementSource } from "../utils/statementSource";

// `run helpers` or `run "lib/helpers"` — read the `.luau` file, wrap its
// body in a function, and call it immediately (dofile-style). The lowerer
// here just extracts the operand; the compiler resolves the file,
// synthesizes the function wrapper, and emits the call (see
// SparkdownCompiler's `run` handling in `parseIncrementally`).
//
// The quotes decide the operand's form (#1389): a quoted operand is a path
// relative to the script, and an unquoted one is a name, the one `.luau`
// file of that name in the project, so an unquoted operand holding a slash
// is a path the author meant to quote, and one that starts with a quote is a
// quoted path whose closing quote is missing (the grammar reads a quote it
// cannot close as part of an unquoted operand). The `.luau` extension is
// implicit in both, so `run "basic"` and `run "basic.luau"` resolve to the
// same file; the lowerer strips it so the compiler only has to deal with one
// form.
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
  // The operand's range: a quoted one with its quotes, an unquoted one
  // without the whitespace around it.
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
    // `run` with no path, or an empty one, runs nothing (#316).
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
  // a quote the line never closes
  if (!quoted && /^["']/.test(written)) {
    return error(closeQuoteMessage(written));
  }
  // value-level: the isolated operand, whose slash makes it a path
  if (!quoted && written.includes("/")) {
    return error(quotePathMessage(written));
  }
  return {
    run: { path, written, quote: quoted ? raw[0]! : "", source },
  };
}
