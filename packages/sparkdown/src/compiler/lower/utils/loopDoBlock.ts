import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SyntaxNode } from "@lezer/common";
import type { LowerContext } from "../context";
import { isStoryHeaderOnlyLoop } from "../../utils/storyIslands";
import { nodeNameSet } from "../../utils/nodeNameSet";

const LUAU_LOOPS = nodeNameSet(["LuauWhileLoop", "LuauForLoop"]);

export function loopBodyBlock(
  loop: GrammarSyntaxNode<SparkdownNodeName>,
): GrammarSyntaxNode<SparkdownNodeName> | undefined {
  return getDescendent(["LuauDoBlock", "LuauSparkdownDoBlock", "LuauSparkdownExplicitDoBlock"], loop);
}

export function findLoopDoBlock(
  loop: SyntaxNode,
  ctx: LowerContext,
): GrammarSyntaxNode<SparkdownNodeName> | undefined {
  const node = loop as GrammarSyntaxNode<SparkdownNodeName>;
  const doBlock = loopBodyBlock(node);
  if (doBlock) return doBlock;
  if (isStoryHeaderOnlyLoop(loop)) return undefined;
  if (LUAU_LOOPS.has(loop.name)) return undefined;
  const keyword =
    getDescendent(["LuauWhileKeyword", "LuauForKeyword"], node) ?? node;
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
