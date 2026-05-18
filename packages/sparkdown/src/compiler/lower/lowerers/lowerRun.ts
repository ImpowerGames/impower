import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";

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
  let path = ctx.read(runContentNode.from, runContentNode.to).trim();
  // Accept both `run "basic"` and `run basic` — strip optional
  // surrounding quotes for consistency with how the existing
  // `include` statement reads its argument unquoted.
  if (
    (path.startsWith('"') && path.endsWith('"')) ||
    (path.startsWith("'") && path.endsWith("'"))
  ) {
    path = path.slice(1, -1);
  }
  // `.luau` extension is implicit — `run` only loads Luau files.
  // Accept either form so authors don't have to remember.
  if (path.endsWith(".luau")) {
    path = path.slice(0, -".luau".length);
  }
  return { run: path };
}
