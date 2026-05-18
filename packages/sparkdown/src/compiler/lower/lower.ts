import { type SyntaxNode } from "@lezer/common";
import { FunctionCall } from "../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "./context";
import { findChildByName } from "./utils/alternatorArms";
import { lowerExpressionFromNodes } from "./expression/lowerExpression";
import { wrapInWeave } from "./utils/wrapInWeave";
import {
  lowerAudioLine,
  lowerImageAndAudioLine,
  lowerImageLine,
} from "./lowerers/lowerAssetLine";
import { lowerBranch } from "./lowerers/lowerBranch";
import { lowerChoice } from "./lowerers/lowerChoice";
import {
  lowerBlockAction,
  lowerBlockDialogue,
  lowerBlockHeading,
  lowerBlockTitle,
  lowerBlockTransitional,
  lowerBlockWrite,
  lowerImplicitAction,
  lowerInlineAction,
  lowerInlineDialogue,
  lowerInlineHeading,
  lowerInlineTitle,
  lowerInlineTransitional,
  lowerInlineWrite,
  lowerLuauInterpolatedStringExpression,
} from "./lowerers/lowerDisplay";
import { lowerDivert } from "./lowerers/lowerDivert";
import {
  lowerDoneStatement,
  lowerFinStatement,
} from "./lowerers/lowerDoneOrFin";
import { lowerExplicitStatement } from "./lowerers/lowerExplicitStatement";
import { lowerGlue } from "./lowerers/lowerGlue";
import { lowerLabelAnchor } from "./lowerers/lowerLabelAnchor";
import { lowerReassignment } from "./lowerers/lowerReassignment";
import { lowerInclude } from "./lowerers/lowerInclude";
import { lowerRun } from "./lowerers/lowerRun";
import { lowerLuauDefine } from "./lowerers/lowerLuauDefine";
import { lowerLuauExternalDeclaration } from "./lowerers/lowerLuauExternalDeclaration";
import { lowerLuauFunctionDefinition } from "./lowerers/lowerLuauFunctionDefinition";
import { lowerLuauLoopStub } from "./lowerers/lowerLuauLoopStub";
import { lowerLuauReturnStatement } from "./lowerers/lowerLuauReturnStatement";
import { lowerScene } from "./lowerers/lowerScene";
import { lowerSparkdownConditionalAlternatorBlock } from "./lowerers/lowerSparkdownConditionalAlternatorBlock";
import { lowerSparkdownChooseBlock } from "./lowerers/lowerSparkdownChooseBlock";
import {
  lowerLuauIfBlock,
  lowerSparkdownIfBlock,
} from "./lowerers/lowerSparkdownIfBlock";
import { lowerSparkdownSequentialAlternatorBlock } from "./lowerers/lowerSparkdownSequentialAlternatorBlock";
import { lowerThread } from "./lowerers/lowerThread";
import { lowerVariableDefinition } from "./lowerers/lowerVariableDefinition";
import { stampDebugMetadata } from "./utils/debugMetadata";

export function lower(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock | undefined {
  const block = lowerInner(nodeRef, ctx);
  // Stamp top-level returned objects with the originating node's position.
  // Nested children without their own metadata inherit via the
  // ParsedObject.parent chain, so we only need to stamp once at the top.
  // Individual lowerers can still set more-specific debug metadata on
  // sub-objects (e.g. on an Identifier within the assignment) — the helper
  // skips objects that already have metadata attached.
  if (block?.content) {
    stampDebugMetadata(block.content, nodeRef.from, nodeRef.to, ctx);
  }
  return block;
}

function lowerInner(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock | undefined {
  switch (nodeRef.name) {
    case "Include":
      return lowerInclude(nodeRef, ctx);
    case "Run":
      return lowerRun(nodeRef, ctx);
    case "Scene":
      return lowerScene(nodeRef, ctx);
    case "Branch":
      return lowerBranch(nodeRef, ctx);
    case "Divert":
    case "ArmDivert":
      // `ArmDivert` is the alternator-arm-context-bounded variant of
      // `Divert` (see grammar). Same captures, same `buildDivert`
      // handling — different end pattern so the divert stops at `|` /
      // `end` boundaries inside an alternator instead of running to
      // end-of-line.
      return lowerDivert(nodeRef, ctx);
    case "DoneStatement":
      return lowerDoneStatement(nodeRef, ctx);
    case "FinStatement":
      return lowerFinStatement(nodeRef, ctx);
    case "Thread":
      return lowerThread(nodeRef, ctx);
    case "LabelAnchor":
      return lowerLabelAnchor(nodeRef, ctx);
    case "Choice":
      return lowerChoice(nodeRef, ctx);
    case "InlineDialogue":
      return lowerInlineDialogue(nodeRef, ctx);
    case "ImplicitAction":
      return lowerImplicitAction(nodeRef, ctx);
    case "LuauInterpolatedStringExpression":
      // Bare `{ expr }` lines at top level — the grammar matches these
      // as `LuauInterpolatedStringExpression` directly (not wrapped in
      // ImplicitAction the way `text {expr} text` lines are). Sparkdown
      // handles them via `lowerExpressionFromContainer`; without this
      // case they fall through to the legacy InkParser fallback, which
      // doesn't know Luau-specific operators (`^`, `//`, `..`).
      return lowerLuauInterpolatedStringExpression(nodeRef, ctx);
    case "InlineAction":
      return lowerInlineAction(nodeRef, ctx);
    case "InlineHeading":
      return lowerInlineHeading(nodeRef, ctx);
    case "InlineTitle":
      return lowerInlineTitle(nodeRef, ctx);
    case "InlineTransitional":
      return lowerInlineTransitional(nodeRef, ctx);
    case "InlineWrite":
      return lowerInlineWrite(nodeRef, ctx);
    case "BlockDialogue":
      return lowerBlockDialogue(nodeRef, ctx);
    case "BlockAction":
      return lowerBlockAction(nodeRef, ctx);
    case "BlockHeading":
      return lowerBlockHeading(nodeRef, ctx);
    case "BlockTitle":
      return lowerBlockTitle(nodeRef, ctx);
    case "BlockTransitional":
      return lowerBlockTransitional(nodeRef, ctx);
    case "BlockWrite":
      return lowerBlockWrite(nodeRef, ctx);
    case "ImageLine":
      return lowerImageLine(nodeRef, ctx);
    case "AudioLine":
      return lowerAudioLine(nodeRef, ctx);
    case "ImageAndAudioLine":
      return lowerImageAndAudioLine(nodeRef, ctx);
    case "LuauVariableDefinition":
      return lowerVariableDefinition(nodeRef, ctx);
    case "LuauExplicitStatement":
      return lowerExplicitStatement(nodeRef, ctx);
    case "Glue":
      return lowerGlue(nodeRef, ctx);
    case "LuauReassignment": {
      // The grammar wraps `x = 5` (bare) inside this node. The lowerer
      // helper takes the LuauAccessPath + LuauAssignmentOperation as
      // separate args, so dig them out of the wrapper here. (The same
      // helper is also called from `lowerStatements` when the grammar
      // produces them as siblings — both paths converge.)
      let pathChild: SyntaxNode | null = null;
      let opChild: SyntaxNode | null = null;
      let inner = nodeRef.node.firstChild;
      while (inner) {
        if (inner.name === "LuauAccessPath" && !pathChild) pathChild = inner;
        else if (inner.name === "LuauAssignmentOperation" && !opChild)
          opChild = inner;
        inner = inner.nextSibling;
      }
      // The content lives one level deeper inside a `_content` wrapper.
      if (!pathChild || !opChild) {
        const content = findChildByName(
          nodeRef.node,
          "LuauReassignment_content",
        );
        if (content) {
          let c = content.firstChild;
          while (c) {
            if (c.name === "LuauAccessPath" && !pathChild) pathChild = c;
            else if (c.name === "LuauAssignmentOperation" && !opChild)
              opChild = c;
            c = c.nextSibling;
          }
        }
      }
      if (!pathChild || !opChild) return {};
      return lowerReassignment(pathChild, opChild, ctx);
    }
    case "LuauSparkdownChooseBlock":
      return lowerSparkdownChooseBlock(nodeRef, ctx);
    case "LuauSparkdownIfBlock":
      return lowerSparkdownIfBlock(nodeRef, ctx);
    case "LuauSparkdownConditionalAlternatorBlock":
    case "LuauSparkdownSingleLineConditionalAlternatorBlock":
      return lowerSparkdownConditionalAlternatorBlock(nodeRef, ctx);
    case "LuauSparkdownSequentialAlternatorBlock":
    case "LuauSparkdownSingleLineSequentialAlternatorBlock":
      return lowerSparkdownSequentialAlternatorBlock(nodeRef, ctx);
    case "LuauDefine":
      return lowerLuauDefine(nodeRef, ctx);
    case "LuauFunctionDefinition":
      return lowerLuauFunctionDefinition(nodeRef, ctx);
    case "LuauIfBlock":
      return lowerLuauIfBlock(nodeRef, ctx);
    case "LuauReturnStatement":
      return lowerLuauReturnStatement(nodeRef, ctx);
    case "LuauExternalDeclaration":
      return lowerLuauExternalDeclaration(nodeRef, ctx);
    case "LuauForLoop":
    case "LuauWhileLoop":
    case "LuauRepeatLoop":
    case "LuauDoBlock":
      return lowerLuauLoopStub(nodeRef, ctx);
    case "LuauEndKeyword":
      // Stand-alone `end` keyword (the scene/branch/function terminator).
      // It's purely a structural marker — no runtime content. Swallow it
      // so the InkParser fallback isn't invoked.
      return {};
    default:
      return undefined;
  }
}

// Walks the direct children of `parent`, lowering each as a top-level
// statement and merging the resulting ParsedObjects into a flat list. Any
// inner Weave from a child is unwrapped — the caller is responsible for
// wrapping the combined output in a Weave (or ContentList, etc.).
//
// `skipNames` lets the caller exclude specific child node types (e.g. the
// condition node of an if-block, or nested else/elseif blocks the caller
// will handle separately).
// Names whose nodes only affect layout / annotation and shouldn't break up
// the sibling-pair detection for implicit assignments. When we see
// `LuauAccessPath` followed by these and then `LuauAssignmentOperation`, the
// access path + operation still form one assignment statement.
const ASSIGNMENT_PAIR_BRIDGE: ReadonlySet<string> = new Set([
  "Newline",
  "ExtraWhitespace",
  "LuauComment",
]);

export function lowerStatements(
  parent: SyntaxNode | null,
  ctx: LowerContext,
  skipNames: ReadonlySet<string> = new Set(),
): ParsedObject[] {
  if (!parent) return [];
  const result: ParsedObject[] = [];
  let child = parent.firstChild;
  while (child) {
    if (!skipNames.has(child.name)) {
      // Implicit assignment statement: an `LuauAccessPath` immediately
      // followed by a `LuauAssignmentOperation` sibling forms a bare
      // reassignment (`total = total + 1`, `obj.field = value`, etc.).
      // Lua's parser does the same thing — parse a suffixed expression, then
      // disambiguate based on what follows. We do it at the lowerer level
      // because TextMate can't easily encode arbitrary access-path shapes
      // in a regex lookahead.
      if (child.name === "LuauAccessPath") {
        const opSibling = findAssignmentOperationAfter(child);
        if (opSibling) {
          const block = lowerReassignment(child, opSibling, ctx);
          appendBlockContent(result, block);
          child = opSibling.nextSibling;
          continue;
        }
        // Bare statement-level function call inside a Luau-context
        // body (function/if/for/while/do/repeat). Luau allows
        // `foo()` as a statement; sparkdown's `LuauExplicitStatement`
        // covers the `& foo()` form, but inside function bodies the
        // discard prefix is optional. Reuse the same lowering path
        // as `& foo()` — produce a FunctionCall and flag
        // `shouldPopReturnedValue` so the unused return is popped.
        // Non-call paths (e.g. a bare `x` or `1 + 2`) lower to non-
        // FunctionCall expressions and have no statement-level side
        // effects, so they're silently dropped (matching Luau).
        const callExpr = lowerExpressionFromNodes([child], ctx);
        if (callExpr instanceof FunctionCall) {
          callExpr.shouldPopReturnedValue = true;
          appendBlockContent(result, wrapInWeave([callExpr]));
          child = child.nextSibling;
          continue;
        }
      }
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      if (block?.content) {
        appendBlockContent(result, block);
      }
    }
    child = child.nextSibling;
  }
  return result;
}

function findAssignmentOperationAfter(
  accessPath: SyntaxNode,
): SyntaxNode | null {
  let next = accessPath.nextSibling;
  while (next && ASSIGNMENT_PAIR_BRIDGE.has(next.name)) {
    next = next.nextSibling;
  }
  return next?.name === "LuauAssignmentOperation" ? next : null;
}

function appendBlockContent(
  result: ParsedObject[],
  block: CompiledBlock,
): void {
  if (!block.content) return;
  for (const obj of block.content) {
    if (obj instanceof Weave) {
      for (const inner of obj.content) {
        result.push(inner);
      }
    } else {
      result.push(obj);
    }
  }
}
