import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Choice } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock, InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lower, lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInWeave } from "../utils/wrapInWeave";

// Lowers a `choose ... [then [(label)] ...] end` block — sparkdown's
// block-based weave syntax that replaces ink's mark-counting / dash-
// prefix gather convention.
//
// The block contains a sequence of `*` / `+` choices (lowered via the
// regular `lowerChoice`) and an optional `then` clause whose body
// becomes a labeled `Gather`. Everything is wrapped in a `Weave` —
// the same runtime shape ink's `Weave` class produces, just with
// structure-driven depth instead of mark-counted depth.
//
// Depth handling: every choice/gather in this block lives at depth N,
// where N is the choose-block's nesting level (1 for top-level, 2 for
// a choose inside a choice's body, etc.). Nesting depth tracks via
// `ctx.chooseDepth` so recursive `lower()` calls into nested blocks
// see the correct level — inkjs's loose-end gathering then works out.
//
// Nested `if ... end` blocks inside a `choose` body produce
// conditional gating for choices — the surrounding choose machinery
// treats each `if`-branch as inert content (its lowered output gets
// inlined into the weave) so a `if has_key then * Unlock end` inside
// `choose` behaves like a single conditional choice.
export function lowerSparkdownChooseBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  // Nesting depth lives on the context so recursive lowerings (e.g. a
  // nested `choose` inside a choice's body) see the right level.
  const depth = ((ctx as MutableCtx).chooseDepth ?? 0) + 1;
  (ctx as MutableCtx).chooseDepth = depth;

  const content = findChildByName(
    nodeRef.node,
    "LuauSparkdownChooseBlock_content",
  );

  const weaveContent: ParsedObject[] = [];

  // Phase 1: walk the choose-block body. Each Choice "absorbs" all
  // subsequent sibling content (display text, nested choose blocks,
  // diverts, etc.) up until the next Choice or the `then` clause —
  // that content becomes the choice's `innerContent` (what's emitted
  // when the choice is selected). This matches ink's implicit
  // "indented content under a choice belongs to that choice" rule
  // without depending on actual indentation tracking — the grammar
  // already groups them as siblings inside our `_content` wrapper.
  let thenClause: SyntaxNode | null = null;
  let currentChoice: Choice | null = null;
  let child = content?.firstChild ?? null;
  const diagnostics: InkDiagnostic[] = [];
  while (child) {
    if (child.name === "LuauSparkdownChooseThenClause") {
      thenClause = child;
      currentChoice = null;
      child = child.nextSibling;
      continue;
    }
    if (child.name === "Choice") {
      currentChoice = null;
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      if (block?.diagnostics) {
        diagnostics.push(...block.diagnostics);
      }
      if (block?.content) {
        for (const obj of block.content) {
          if (obj instanceof Weave) {
            for (const inner of obj.content) {
              if (inner instanceof Choice) {
                // Override the choice's depth to match this block's
                // nesting level — choices written inside a `choose`
                // block ignore the legacy mark-count depth from
                // `lowerChoice` and use the block's structural depth.
                inner.indentationDepth = depth;
                currentChoice = inner;
              }
              weaveContent.push(inner);
            }
          } else {
            weaveContent.push(obj);
          }
        }
      }
      child = child.nextSibling;
      continue;
    }
    // Non-Choice, non-then content. Two flavors:
    //   - Nested `Weave` (from a sibling `choose`-block): goes into the
    //     OUTER weaveContent as a sibling of the choice. This mirrors
    //     legacy ink where `* one\n  * * two` parses with `two` as a
    //     depth-2 sibling weave point — inkjs's `AddRuntimeForNestedWeave`
    //     then removes the preceding choice from `looseEnds` so it
    //     doesn't get a stray fall-through divert appended.
    //   - Anything else (text, divert, single statements): attaches to
    //     the previous choice's `innerContent` so `* one\n  foo` works
    //     as expected.
    const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
    if (block?.content) {
      for (const obj of block.content) {
        const items =
          obj instanceof Weave ? (obj.content as ParsedObject[]) : [obj];
        for (const item of items) {
          if (item instanceof Weave) {
            weaveContent.push(item);
          } else if (currentChoice) {
            currentChoice.innerContent.AddContent(item);
          } else {
            weaveContent.push(item);
          }
        }
      }
    }
    child = child.nextSibling;
  }

  // Phase 2: if there's a `then` clause, lower its body and wrap it in
  // a Gather at the same depth.
  if (thenClause) {
    const gather = buildGatherFromThenClause(thenClause, depth, ctx);
    if (gather) weaveContent.push(gather);
  }

  (ctx as MutableCtx).chooseDepth = depth - 1;

  const block = wrapInWeave([new Weave(weaveContent, depth)]);
  if (diagnostics.length > 0) {
    block.diagnostics = diagnostics;
  }
  return block;
}

interface MutableCtx {
  chooseDepth?: number;
}

function buildGatherFromThenClause(
  thenClause: SyntaxNode,
  depth: number,
  ctx: LowerContext,
): Gather | null {
  // Optional `(label)` after `then` is captured into
  // `LuauSparkdownChooseThenClause_begin_c4` as a `Label` child.
  const label = getDescendent("LabelDeclarationName", thenClause);
  const identifier = label
    ? new Identifier(ctx.read(label.from, label.to))
    : null;

  const body = findChildByName(
    thenClause,
    "LuauSparkdownChooseThenClause_content",
  );
  const gather = new Gather(identifier, depth);
  const bodyContent = lowerStatements(body, ctx);
  for (const obj of bodyContent) {
    gather.AddContent(obj);
  }
  return gather;
}
