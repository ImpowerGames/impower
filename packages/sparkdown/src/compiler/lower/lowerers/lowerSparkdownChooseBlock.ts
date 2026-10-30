import { identifierAt } from "../utils/debugMetadata";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Choice } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import type { CompiledBlock,InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { lower, lowerBodyStatement, lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { captionDisplayCall, isDisplayCall } from "../utils/displayCall";
import {
  closeStatement,
  currentStatement,
  inlineChoiceBranches,
  openBody,
  openStatement,
  recordChooseContext,
  recordChoiceBody,
  type BodyShape,
} from "../utils/statementShape";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerSparkdownChooseBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const depth = ((ctx as MutableCtx).chooseDepth ?? 0) + 1;
  (ctx as MutableCtx).chooseDepth = depth;
  const inPreamble = (ctx as MutableCtx).inChoosePreamble === true;
  recordChooseContext(ctx, `${depth}:${inPreamble}`);

  const content = findChildByName(
    nodeRef.node,
    "LuauSparkdownChooseBlock_content",
  );

  const weaveContent: ParsedObject[] = [];

  let thenClause: SyntaxNode | null = null;
  let currentChoice: Choice | null = null;
  let currentBody: BodyShape | undefined;
  let sawChoice = false;
  let child = content?.firstChild ?? null;
  const diagnostics: InkDiagnostic[] = [];
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
                inner.indentationDepth = depth;
                currentChoice = inner;
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
      if (currentChoice) {
        currentBody = openBody(
          ctx,
          child.from,
          child.to,
          nextPartStart(child),
        );
        if (currentBody) {
          recordChoiceBody(currentChoice, currentBody);
        }
      }
      child = child.nextSibling;
      continue;
    }
    (ctx as MutableCtx).inChoosePreamble = currentChoice === null;
    const shape = currentBody ? openStatement(ctx, child) : undefined;
    const items: ParsedObject[] = [];
    try {
      const block = lowerBodyStatement(child as GrammarSyntaxNode<SparkdownNodeName>, ctx, shape);
      if (block?.diagnostics) {
        diagnostics.push(...block.diagnostics);
      }
      if (!sawChoice && block?.content?.some(holdsChoice)) {
        markCaption(weaveContent);
        sawChoice = true;
      }
      for (const obj of block?.content ?? []) {
        if (!(obj instanceof Weave)) {
          items.push(obj);
          continue;
        }
        const wrapperMetadata = currentBody ? obj.ownDebugMetadata : null;
        for (const inner of obj.content as ParsedObject[]) {
          if (wrapperMetadata && !inner.ownDebugMetadata) {
            inner.debugMetadata = wrapperMetadata;
          }
          items.push(inner);
        }
      }
      if (!currentChoice) {
        inlineChoiceBranches(
          ctx,
          items,
          holdsChoice,
          (obj) => obj instanceof Choice,
          (obj) => obj instanceof Gather,
        );
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
    gather.endsChooseBlock = !inPreamble;
    weaveContent.push(gather);
  }

  (ctx as MutableCtx).chooseDepth = depth - 1;
  (ctx as MutableCtx).inChoosePreamble = inPreamble;

  const weave = new Weave(weaveContent, depth);
  weave.isChooseBlock = !inPreamble;
  weave.isPreambleChoose = inPreamble;
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

function markCaption(items: ParsedObject[]): void {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (isDisplayCall(item)) {
      captionDisplayCall(item);
      return;
    }
  }
}

function holdsChoice(obj: ParsedObject): boolean {
  return (
    obj instanceof Choice ||
    (obj.content ?? []).some((child) => holdsChoice(child))
  );
}

function buildGatherFromThenClause(
  thenClause: SyntaxNode,
  depth: number,
  ctx: LowerContext,
  endStart: number,
): Gather {
  const header = findChildByName(
    thenClause,
    "LuauSparkdownChooseThenClause_begin",
  );
  const label = header
    ? getDescendent("LabelDeclarationName", header)
    : null;
  const identifier = label ? identifierAt(label, ctx) : null;

  const body = findChildByName(
    thenClause,
    "LuauSparkdownChooseThenClause_content",
  );
  const gather = new Gather(identifier, depth);
  const shape = openBody(
    ctx,
    thenClause.from,
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
