import { identifierAt } from "../utils/debugMetadata";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Choice } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { CompiledBlock,InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { lower, lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { captionDisplayCall, isDisplayCall } from "../utils/displayCall";
import {
  closeStatement,
  currentStatement,
  inlineChoiceBranches,
  openBody,
  openStatement,
  recordChoiceBody,
  type BodyShape,
} from "../utils/statementShape";
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
  // A block written in another block's preamble (before its first choice or
  // inside an `if` there) offers its choices with that block's, so it holds
  // no flow of its own: its choices continue where the other block's do.
  const inPreamble = (ctx as MutableCtx).inChoosePreamble === true;

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
  // The body the statements after the current choice are recorded in, when
  // shapes are recorded: a block of this statement.
  let currentBody: BodyShape | undefined;
  let sawChoice = false;
  let child = content?.firstChild ?? null;
  const diagnostics: InkDiagnostic[] = [];
  // Where the part after each choice starts: the next choice, the `then`
  // clause, or the block's `end`, where its content ends. A choice's body
  // runs from the choice's line to that part.
  const nextPartStart = (choiceNode: SyntaxNode): number => {
    for (let next = choiceNode.nextSibling; next; next = next.nextSibling) {
      if (
        next.name === "Choice" ||
        next.name === "LuauSparkdownChooseThenClause"
      ) {
        return next.from;
      }
    }
    return content?.to ?? nodeRef.to;
  };
  while (child) {
    if (child.name === "LuauSparkdownChooseThenClause") {
      thenClause = child;
      currentChoice = null;
      currentBody = undefined;
      child = child.nextSibling;
      continue;
    }
    if (child.name === "Choice") {
      if (!sawChoice) {
        markCaption(weaveContent);
      }
      sawChoice = true;
      currentChoice = null;
      currentBody = undefined;
      (ctx as MutableCtx).inChoosePreamble = false;
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
                // For the binary program's line table, the choice's own
                // line, as a statement unwrapped from its weave takes it
                // (`appendBlockContent`), in place of the block's header
                // line, which `stampStatement` gives the block's choices.
                // Only when shapes are recorded, which the current engine's
                // compile leaves as it was.
                if (
                  currentStatement(ctx) &&
                  obj.ownDebugMetadata &&
                  !inner.ownDebugMetadata
                ) {
                  inner.debugMetadata = obj.ownDebugMetadata;
                }
              }
              weaveContent.push(inner);
            }
          } else {
            weaveContent.push(obj);
          }
        }
      }
      // The choice's body is a block of this statement, whose statements
      // are the lines after the choice up to the next part. The choice's
      // node ends where its line does.
      if (currentChoice) {
        currentBody = openBody(ctx, child.to, nextPartStart(child));
        if (currentBody) {
          recordChoiceBody(currentChoice, currentBody);
        }
      }
      child = child.nextSibling;
      continue;
    }
    // Non-Choice, non-then content, including a nested `choose` block's
    // `Weave`, attaches in order to the previous choice's `innerContent`, so
    // a line after a nested block's `end` runs after that block's choice.
    // Before the first choice it is the preamble, which runs before the
    // choices are offered, as the block's own code.
    (ctx as MutableCtx).inChoosePreamble = currentChoice === null;
    const shape = currentBody ? openStatement(ctx, child) : undefined;
    const items: ParsedObject[] = [];
    try {
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      if (block?.diagnostics) {
        diagnostics.push(...block.diagnostics);
      }
      // A construct that holds a choice (a conditional whose branches offer
      // them) holds the block's first choice when no choice came before it,
      // so the display statements before it are the caption.
      if (!sawChoice && block?.content?.some(holdsChoice)) {
        markCaption(weaveContent);
        sawChoice = true;
      }
      for (const obj of block?.content ?? []) {
        if (!(obj instanceof Weave)) {
          items.push(obj);
          continue;
        }
        // A statement of a choice's body takes the range of the weave it is
        // unwrapped from, as a statement of any other body does
        // (`appendBlockContent`), so that its chunk does not depend on the
        // body it stands in.
        const wrapperMetadata = currentBody ? obj.ownDebugMetadata : null;
        for (const inner of obj.content as ParsedObject[]) {
          if (wrapperMetadata && !inner.ownDebugMetadata) {
            inner.debugMetadata = wrapperMetadata;
          }
          items.push(inner);
        }
      }
      if (!currentChoice) {
        // An `if` of the preamble that offers choices gates them: its
        // branches are the block's own code.
        inlineChoiceBranches(ctx, items, holdsChoice);
      }
    } finally {
      if (shape && currentBody) {
        closeStatement(ctx, shape, currentBody, child, items, 0);
      }
    }
    for (const item of items) {
      if (currentChoice) {
        currentChoice.innerContent.AddContent(item);
      } else {
        weaveContent.push(item);
      }
    }
    child = child.nextSibling;
  }

  // Phase 2: the block's `end` is a Gather at the same depth, so every choice
  // continues there once its content runs out. A `then` clause's body is that
  // Gather's content; without one the Gather is empty and the content after
  // the block follows it. The Gather ends the block: the flow stops before it
  // once the choices are offered, and runs on out of it into whatever follows
  // the block. A block in another block's preamble keeps only its `then`
  // clause, as an ordinary Gather.
  (ctx as MutableCtx).inChoosePreamble = false;
  const gather = thenClause
    ? buildGatherFromThenClause(
        thenClause,
        depth,
        ctx,
        content?.to ?? nodeRef.to,
      )
    : inPreamble
      ? null
      : new Gather(null, depth);
  if (gather) {
    gather.endsChooseBlock = sawChoice && !inPreamble;
    weaveContent.push(gather);
  }

  (ctx as MutableCtx).chooseDepth = depth - 1;
  (ctx as MutableCtx).inChoosePreamble = inPreamble;

  const weave = new Weave(weaveContent, depth);
  weave.isChooseBlock = !inPreamble;
  const block = wrapInWeave([weave]);
  if (diagnostics.length > 0) {
    block.diagnostics = diagnostics;
  }
  return block;
}

interface MutableCtx {
  chooseDepth?: number;
  inChoosePreamble?: boolean;
}

// The display statements before a block's first choice are its caption. The
// last of them is marked `caption`: its newline waits, so its step runs on and
// completes with the caption and the choices together. Whatever the run shows
// before the choices (a `print`, a line a function or a conditional shows, a
// tag) writes the newline first and starts the next step, so only the run
// decides, and nothing between the caption and the choices is inspected here.
// Earlier caption lines are steps of their own.
function markCaption(items: ParsedObject[]): void {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (isDisplayCall(item)) {
      captionDisplayCall(item);
      return;
    }
  }
}

// Whether `obj` is a choice or holds one anywhere inside it.
function holdsChoice(obj: ParsedObject): boolean {
  return (
    obj instanceof Choice ||
    (obj.content ?? []).some((child) => holdsChoice(child))
  );
}

// The `then` clause's body is a block of the `choose` statement, headed by the
// clause's `then (label)` line and running to the block's `end`, which starts
// at `endStart`.
function buildGatherFromThenClause(
  thenClause: SyntaxNode,
  depth: number,
  ctx: LowerContext,
  endStart: number,
): Gather {
  // Optional `(label)` after `then` is captured as a `Label` child by
  // the begin pattern — find its `LabelDeclarationName` descendant.
  const label = getDescendent("LabelDeclarationName", thenClause);
  const identifier = label ? identifierAt(label, ctx) : null;

  const header = findChildByName(
    thenClause,
    "LuauSparkdownChooseThenClause_begin",
  );
  const body = findChildByName(
    thenClause,
    "LuauSparkdownChooseThenClause_content",
  );
  const gather = new Gather(identifier, depth);
  // The clause's header (`then` and its label) ends where its line does.
  const shape = openBody(
    ctx,
    header?.to ?? thenClause.from,
    endStart,
  );
  if (shape) {
    recordChoiceBody(gather, shape);
  }
  const bodyContent = lowerStatements(body, ctx, undefined, shape);
  for (const obj of bodyContent) {
    gather.AddContent(obj);
  }
  return gather;
}
