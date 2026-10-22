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

// With `valued`, each arm pushes one value (`lowerArms`), for an alternator
// Luau code uses as a value or writes as a statement (`lowerAlternatorValue`).
export function lowerSparkdownSequentialAlternatorBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  valued: ValuedArms | false = false,
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
  const keywordNodes = begin
    ? getDescendents("LuauControlKeyword", begin)
    : [];
  const keywords = keywordNodes.map((k) => ctx.read(k.from, k.to).trim());

  // Bare `shuffle` (no following alternator keyword) defaults to
  // `cycle`. The author's intent for bare `shuffle | a | b end` is
  // "pick a random arm each time around" — cycle-with-shuffle, not
  // queue-with-shuffle (which would play through once and stop).
  let isShuffle = false;
  let mainKeyword = keywords[0] ?? "";
  if (keywords[0] === "shuffle") {
    isShuffle = true;
    mainKeyword = keywords[1] ?? "cycle";
  }

  let seqType = TYPE_BY_KEYWORD[mainKeyword] ?? SequenceType.Once;
  if (isShuffle) seqType |= SequenceType.Shuffle;

  const content = findChildByName(nodeRef.node, `${prefix}_content`);
  // What stands before the first `|` is no arm, but its errors are read,
  // by the reading of Luau code that uses the alternator as a value
  // (`reportNestedAlternators`) when `valued`.
  if (!valued) reportAlternatorHead(nodeRef.node, ctx);
  const arms = lowerArms(content, ctx, valued);

  // An alternator with no arm has nothing to alternate between, and a
  // sequence of no elements makes the engine's shuffle draw from nothing
  // (#1617): it is an error at its keywords, and lowers to nothing.
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
