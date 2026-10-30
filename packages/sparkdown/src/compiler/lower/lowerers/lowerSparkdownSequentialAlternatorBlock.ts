import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { ContentList } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ContentList";
import { Sequence } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Sequence/Sequence";
import { SequenceType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Sequence/SequenceType";
import { ErrorType } from "../../../runtime/Error";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import type { ValuedArms } from "../utils/alternatorValue";
import { findChildByName, lowerArms, reportAlternatorHead } from "../utils/alternatorArms";
import { recordAlternatorSource } from "../utils/statementShape";
import { statementSource } from "../utils/statementSource";
import { wrapInWeave } from "../utils/wrapInWeave";

const TYPE_BY_KEYWORD: { [k: string]: SequenceType } = {
  queue: SequenceType.Once,
  cycle: SequenceType.Cycle,
  chain: SequenceType.Stopping,
};

export function lowerSparkdownSequentialAlternatorBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  valued: ValuedArms | false = false,
): CompiledBlock {
  const prefix = nodeRef.node.name;
  const begin = findChildByName(nodeRef.node, `${prefix}_begin`);
  const keywordNodes = begin
    ? getDescendents("LuauControlKeyword", begin)
    : [];
  const keywords = keywordNodes.map((k) => ctx.read(k.from, k.to).trim());

  let isShuffle = false;
  let mainKeyword = keywords[0] ?? "";
  if (keywords[0] === "shuffle") {
    isShuffle = true;
    mainKeyword = keywords[1] ?? "cycle";
  }

  let seqType = TYPE_BY_KEYWORD[mainKeyword] ?? SequenceType.Once;
  if (isShuffle) seqType |= SequenceType.Shuffle;

  const content = findChildByName(nodeRef.node, `${prefix}_content`);
  if (!valued) reportAlternatorHead(nodeRef.node, ctx);
  const arms = lowerArms(content, ctx, valued);

  if (arms.length === 0) {
    const first = keywordNodes[0];
    const last = keywordNodes[keywordNodes.length - 1];
    const at = first && last ? { from: first.from, to: last.to } : nodeRef.node;
    const block = wrapInWeave([]);
    block.diagnostics = [
      ...(block.diagnostics ?? []),
      {
        message: `A \`${keywords.join(" ") || "queue"}\` needs at least one arm, written \`| ...\``,
        severity: ErrorType.Error,
        source: statementSource(at, ctx),
      },
    ];
    return block;
  }

  const contentLists = arms.map((arm) => new ContentList(arm.body));
  const sequence = new Sequence(contentLists, seqType);
  sequence.valued = valued !== false;
  recordAlternatorSource(ctx, sequence, nodeRef.node);
  return wrapInWeave([sequence]);
}
