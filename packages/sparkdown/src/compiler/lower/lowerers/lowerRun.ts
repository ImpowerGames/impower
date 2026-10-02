import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";

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
  if (!runContentNode) {
    return {};
  }
  const quoted = getDescendent("RunQuotedPath", runContentNode);
  const unquoted = getDescendent("RunUnquotedPath", runContentNode);
  const value = quoted ?? unquoted;
  if (!value) return {};
  let path = quoted
    ? ctx.read(quoted.from + 1, quoted.to - 1)
    : ctx.read(value.from, value.to).trim();
  // `.luau` extension is implicit — `run` only loads Luau files.
  // Accept either form so authors don't have to remember.
  // value-level: normalize the extension of the isolated file path.
  if (path.endsWith(".luau")) {
    path = path.slice(0, -".luau".length);
  }
  return { run: path };
}
