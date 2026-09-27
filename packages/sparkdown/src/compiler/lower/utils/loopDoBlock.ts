import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";

// The `do ... end` block holding a `while` or `for` loop's body. A loop in a
// function body holds a `LuauDoBlock`; a loop in a scene or at the top level
// holds a `LuauSparkdownDoBlock`. The loop's own block is the first of either
// in the loop's subtree, since only the condition comes before it.
//
// A loop written without `do` has no body block: the grammar closes the loop
// at the end of its first line, so the lines under it are not its body.
// That is reported as an error on the loop's keyword rather than lowered.
export function findLoopDoBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): GrammarSyntaxNode<SparkdownNodeName> | undefined {
  const doBlock = getDescendent(
    ["LuauDoBlock", "LuauSparkdownDoBlock"],
    nodeRef.node,
  );
  if (doBlock) return doBlock;
  const keyword =
    getDescendent(["LuauWhileKeyword", "LuauForKeyword"], nodeRef.node) ??
    nodeRef.node;
  const name = ctx.read(keyword.from, keyword.to);
  ctx.diagnostics?.push({
    message: `Expected \`do\` after the \`${name}\` loop's condition. Write \`${name} ... do\`, the body, then \`end\`.`,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(keyword.from) + 1,
      endLineNumber: ctx.lineNumber(keyword.to) + 1,
      startCharacterNumber: ctx.characterNumber(keyword.from) + 1,
      endCharacterNumber: ctx.characterNumber(keyword.to) + 1,
    },
  });
  return undefined;
}
