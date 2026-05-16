import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { ContentList } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ContentList";
import { Sequence } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Sequence/Sequence";
import { SequenceType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Sequence/SequenceType";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName, lowerArms } from "../utils/alternatorArms";
import { wrapInWeave } from "../utils/wrapInWeave";

// queue          → Sequence(Once)         — plays through and stops
// cycle          → Sequence(Cycle)        — repeats from start
// chain          → Sequence(Stopping)     — repeats the last item forever
// shuffle queue  → Sequence(Once | Shuffle)
// shuffle cycle  → Sequence(Cycle | Shuffle)
// shuffle chain  → Sequence(Stopping | Shuffle)

const TYPE_BY_KEYWORD: { [k: string]: SequenceType } = {
  queue: SequenceType.Once,
  cycle: SequenceType.Cycle,
  chain: SequenceType.Stopping,
};

export function lowerSparkdownSequentialAlternatorBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  // Works for both the top-level `LuauSparkdownSequentialAlternatorBlock`
  // (block form: `queue ... | ... end` on its own lines) and the inline
  // `LuauSequentialAlternatorBlock` (the variant the grammar produces
  // when the construct appears inside `{...}` interpolation). The two
  // rules generate begin/content/end children with different name
  // prefixes; deriving the prefix from the node's own name lets the
  // same lowerer handle both.
  const prefix = nodeRef.node.name;
  const begin = findChildByName(nodeRef.node, `${prefix}_begin`);
  const keywords = begin
    ? getDescendents("LuauControlKeyword", begin).map((k) =>
        ctx.read(k.from, k.to).trim(),
      )
    : [];

  let isShuffle = false;
  let mainKeyword = keywords[0] ?? "";
  if (keywords[0] === "shuffle" && keywords[1]) {
    isShuffle = true;
    mainKeyword = keywords[1];
  }

  let seqType = TYPE_BY_KEYWORD[mainKeyword] ?? SequenceType.Once;
  if (isShuffle) seqType |= SequenceType.Shuffle;

  const content = findChildByName(nodeRef.node, `${prefix}_content`);
  const arms = lowerArms(content, ctx);

  const contentLists = arms.map((arm) => new ContentList(arm.body));
  const sequence = new Sequence(contentLists, seqType);
  return wrapInWeave([sequence]);
}
