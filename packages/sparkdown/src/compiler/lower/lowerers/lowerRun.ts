import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { statementSource } from "../utils/statementSource";

// `run "path"` — read the named `.luau` file, wrap its body in a
// function, and call it immediately (dofile-style). The lowerer here
// just extracts the path; the compiler resolves the file, synthesizes
// the function wrapper, and emits the call (see SparkdownCompiler's
// `run` handling in `parseIncrementally`).
//
// Path normalization rules: `.luau` extension is implicit, so
// `run "basic"` and `run "basic.luau"` resolve to the same file.
// The lowerer normalizes the latter to the former so the compiler
// only has to deal with one form.
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
  let path = quoted
    ? ctx.read(quoted.from + 1, quoted.to - 1)
    : value
      ? ctx.read(value.from, value.to).trim()
      : "";
  // `.luau` extension is implicit — `run` only loads Luau files.
  // Accept either form so authors don't have to remember.
  // value-level: normalize the extension of the isolated file path.
  if (path.endsWith(".luau")) {
    path = path.slice(0, -".luau".length);
  }
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
  return { run: path };
}
