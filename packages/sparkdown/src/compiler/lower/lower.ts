import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CallValueExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { FunctionCall } from "../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "./context";
import { findChildByName } from "./utils/alternatorArms";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "./expression/lowerExpression";
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
import {
  lowerLuauBreakStatement,
  lowerLuauContinueStatement,
} from "./lowerers/lowerLuauBreakContinue";
import { lowerLuauDoBlock } from "./lowerers/lowerLuauDoBlock";
import { lowerLuauForLoop } from "./lowerers/lowerLuauForLoop";
import { lowerLuauLoopStub } from "./lowerers/lowerLuauLoopStub";
import {
  lowerLuauRepeatLoop,
  lowerLuauUntilStatement,
} from "./lowerers/lowerLuauRepeatLoop";
import { lowerLuauWhileLoop } from "./lowerers/lowerLuauWhileLoop";
import { lowerLuauReturnStatement } from "./lowerers/lowerLuauReturnStatement";
import { lowerScene } from "./lowerers/lowerScene";
import { lowerSparkdownConditionalAlternatorBlock } from "./lowerers/lowerSparkdownConditionalAlternatorBlock";
import { lowerSparkdownChooseBlock } from "./lowerers/lowerSparkdownChooseBlock";
import {
  lowerLuauIfBlock,
  lowerSparkdownIfBlock,
} from "./lowerers/lowerSparkdownIfBlock";
import { lowerSparkdownSequentialAlternatorBlock } from "./lowerers/lowerSparkdownSequentialAlternatorBlock";
import { lowerTags } from "./lowerers/lowerTags";
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
      // The grammar wraps `x = 5` (bare) inside this node. Two shapes:
      //
      // Single-target (`x = 5` / `obj.field = v`):
      //   LuauAccessPath
      //   LuauAssignmentOperation
      //
      // Multi-target (`a, b = 10, 20` / `a, b = f()`):
      //   LuauAccessPath, LuauCommaSeparator, LuauAccessPath, …,
      //   LuauAssignmentOperation, [LuauCommaSeparator, <expr>, …]
      //
      // Try multi-target first; fall back to the single-target helper
      // for everything else.
      const content =
        findChildByName(nodeRef.node, "LuauReassignment_content") ??
        nodeRef.node;
      let firstAccessPath: SyntaxNode | null = null;
      let scan = content.firstChild;
      while (scan) {
        if (scan.name === "LuauAccessPath") {
          firstAccessPath = scan;
          break;
        }
        scan = scan.nextSibling;
      }
      if (firstAccessPath) {
        const multi = scanMultiTargetReassignment(firstAccessPath);
        if (multi) return lowerMultiTargetReassignment(multi, ctx);
      }

      // Single-target fallback. The lowerer helper takes the
      // LuauAccessPath + LuauAssignmentOperation as separate args, so
      // dig them out of the wrapper.
      let pathChild: SyntaxNode | null = firstAccessPath;
      let opChild: SyntaxNode | null = null;
      let inner = content.firstChild;
      while (inner) {
        if (inner.name === "LuauAccessPath" && !pathChild) pathChild = inner;
        else if (inner.name === "LuauAssignmentOperation" && !opChild)
          opChild = inner;
        inner = inner.nextSibling;
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
    case "LuauWhileLoop":
      return lowerLuauWhileLoop(nodeRef, ctx);
    case "LuauDoBlock":
      return lowerLuauDoBlock(nodeRef, ctx);
    case "LuauForLoop":
      return lowerLuauForLoop(nodeRef, ctx);
    case "LuauRepeatLoop":
      return lowerLuauRepeatLoop(nodeRef, ctx);
    case "LuauUntilStatement":
      // No-op — the until-statement is consumed by the sibling
      // `LuauRepeatLoop` lowerer above (it peeks forward to grab the
      // condition). This case keeps the dispatcher from falling
      // through to the InkParser fallback, which would treat `until
      // X` as narrative text.
      return lowerLuauUntilStatement(nodeRef, ctx);
    case "LuauBreakStatement":
      return lowerLuauBreakStatement(nodeRef, ctx);
    case "LuauContinueStatement":
      return lowerLuauContinueStatement(nodeRef, ctx);
    case "LuauEndKeyword":
      // Stand-alone `end` keyword (the scene/branch/function terminator).
      // It's purely a structural marker — no runtime content. Swallow it
      // so the InkParser fallback isn't invoked.
      return {};
    case "Tags":
      // Top-level `# tag` (or `# a # b`) line. The grammar produces a
      // single `Tags` wrapper containing one or more `Tag` children.
      // Display-line trailing tags are handled inline by `lowerDisplay`;
      // this case covers the standalone form that contributes to
      // `globalTags` / `TagsForContentAtPath`.
      return lowerTags(nodeRef, ctx);
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
        // Implicit multi-target reassignment (`a, b = f()` /
        // `a, b = 10, 20`). Scan the siblings for the multi-target
        // shape — multiple access paths separated by commas before
        // an assignment op, then any trailing RHS expressions after.
        // Falls through to the single-target path below when only
        // one target precedes the op.
        const multi = scanMultiTargetReassignment(child);
        if (multi) {
          const block = lowerMultiTargetReassignment(multi, ctx);
          appendBlockContent(result, block);
          child = multi.lastNode.nextSibling;
          continue;
        }
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
        //
        // Method-call shape (`table.insert(t, 40)` etc.): the access
        // path and the call args parse as ADJACENT siblings. Pair the
        // access path with its sibling `LuauParenthetical` before
        // lowering — without this pairing, dotted / namespaced calls
        // produce a non-`FunctionCall` expression and get silently
        // dropped. Mirrors `lowerExplicitStatement`'s combining.
        const callNodes: SyntaxNode[] = [child];
        let parenScan: SyntaxNode | null = child.nextSibling;
        while (parenScan && ASSIGNMENT_PAIR_BRIDGE.has(parenScan.name)) {
          parenScan = parenScan.nextSibling;
        }
        let consumedParen: SyntaxNode | null = null;
        if (parenScan && parenScan.name === "LuauParenthetical") {
          callNodes.push(parenScan);
          consumedParen = parenScan;
        }
        const callExpr = lowerExpressionFromNodes(callNodes, ctx);
        if (callExpr instanceof FunctionCall) {
          callExpr.shouldPopReturnedValue = true;
          appendBlockContent(result, wrapInWeave([callExpr]));
          child = (consumedParen ?? child).nextSibling;
          continue;
        }
        // User-defined method dispatch routes through
        // `CallValueExpression` instead of `FunctionCall`. Same
        // statement-context treatment: pop the unused return value.
        if (callExpr instanceof CallValueExpression) {
          callExpr.shouldPopReturnedValue = true;
          appendBlockContent(result, wrapInWeave([callExpr]));
          child = (consumedParen ?? child).nextSibling;
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

interface MultiTargetReassignment {
  targets: SyntaxNode[];
  op: SyntaxNode;
  trailingExprGroups: SyntaxNode[][];
  lastNode: SyntaxNode;
}

// Scan siblings starting from `firstTarget` (a `LuauAccessPath`) for the
// multi-target reassignment shape:
//
//   AccessPath  [Comma AccessPath]+  AssignmentOperation  [Comma Expr]*
//
// Returns the collected pieces if at least 2 targets sit before the
// assignment op; returns `null` otherwise so the caller can fall back to
// single-target lowering. Anything unexpected between the multi-target
// pieces (e.g. a stray identifier) also returns `null` rather than risk a
// silent mis-parse.
function scanMultiTargetReassignment(
  firstTarget: SyntaxNode,
): MultiTargetReassignment | null {
  const targets: SyntaxNode[] = [firstTarget];
  let cursor: SyntaxNode | null = firstTarget.nextSibling;
  while (cursor) {
    if (ASSIGNMENT_PAIR_BRIDGE.has(cursor.name)) {
      cursor = cursor.nextSibling;
      continue;
    }
    if (cursor.name === "LuauCommaSeparator") {
      const afterComma = skipBridges(cursor.nextSibling);
      if (afterComma?.name === "LuauAccessPath") {
        targets.push(afterComma);
        cursor = afterComma.nextSibling;
        continue;
      }
      // Comma must be followed by an access path in the target list.
      return null;
    }
    if (cursor.name === "LuauAssignmentOperation") {
      if (targets.length < 2) return null;
      const op = cursor;
      const trailingExprGroups: SyntaxNode[][] = [];
      let current: SyntaxNode[] = [];
      let last: SyntaxNode = op;
      let post: SyntaxNode | null = op.nextSibling;
      while (post) {
        if (ASSIGNMENT_PAIR_BRIDGE.has(post.name)) {
          post = post.nextSibling;
          continue;
        }
        if (post.name === "LuauCommaSeparator") {
          if (current.length > 0) {
            trailingExprGroups.push(current);
            current = [];
          }
          last = post;
          post = post.nextSibling;
          continue;
        }
        current.push(post);
        last = post;
        post = post.nextSibling;
      }
      if (current.length > 0) trailingExprGroups.push(current);
      return { targets, op, trailingExprGroups, lastNode: last };
    }
    return null;
  }
  return null;
}

function skipBridges(n: SyntaxNode | null): SyntaxNode | null {
  let cur = n;
  while (cur && ASSIGNMENT_PAIR_BRIDGE.has(cur.name)) cur = cur.nextSibling;
  return cur;
}

function lowerMultiTargetReassignment(
  multi: MultiTargetReassignment,
  ctx: LowerContext,
): CompiledBlock {
  // Reject any target that isn't a plain `LuauVariableName` — property
  // targets (`obj.field`) and indexed targets (`arr[k]`) in multi-target
  // reassignment are deferred (would need per-target StorePropertyAssignment).
  const targetIdents: Identifier[] = [];
  for (const t of multi.targets) {
    const nameNode = getDescendent("LuauVariableName", t);
    if (!nameNode) return {};
    targetIdents.push(new Identifier(ctx.read(nameNode.from, nameNode.to)));
  }
  const firstRhs = lowerExpressionFromContainer(multi.op, ctx);
  const trailingExprs = multi.trailingExprGroups
    .map((nodes) => lowerExpressionFromNodes(nodes, ctx))
    .filter((e): e is NonNullable<typeof e> => e != null);
  const expressions = firstRhs ? [firstRhs, ...trailingExprs] : trailingExprs;
  return wrapInWeave([
    new MultiVariableAssignment(targetIdents, expressions, false),
  ]);
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
