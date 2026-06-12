import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CallValueExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { Expression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { IndexExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { MultiVariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { StorePropertyAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { StringExpression } from "../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
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
        // Compute the statement's source range — spans the access path
        // plus the trailing parenthetical (if any). Used by
        // `wrapInWeave` to attach per-statement debug metadata so the
        // call's runtime objects report their actual source line, not
        // the enclosing function's start line.
        const stmtRange = {
          from: child.from,
          to: (consumedParen ?? child).to,
        };
        if (callExpr instanceof FunctionCall) {
          callExpr.shouldPopReturnedValue = true;
          appendBlockContent(result, wrapInWeave([callExpr], stmtRange, ctx));
          child = (consumedParen ?? child).nextSibling;
          continue;
        }
        // User-defined method dispatch routes through
        // `CallValueExpression` instead of `FunctionCall`. Same
        // statement-context treatment: pop the unused return value.
        if (callExpr instanceof CallValueExpression) {
          callExpr.shouldPopReturnedValue = true;
          appendBlockContent(result, wrapInWeave([callExpr], stmtRange, ctx));
          child = (consumedParen ?? child).nextSibling;
          continue;
        }
      }
      // IIFE statement: `(function () ... end)(args)` — a parenthesized
      // value immediately followed by call parens, both parsing as
      // adjacent sibling `LuauParenthetical` nodes at statement level.
      // The expression-context equivalent is folded inside
      // `collectTokens`, but statement-level parentheticals reach this
      // dispatcher directly and previously fell through to `default:
      // undefined` — the whole statement (including its upvalue
      // writes) silently vanished. basic.luau line 50:
      //   local a = 1 (function () a = 2 end)() return a
      // Collect the value parenthetical plus every trailing call
      // parenthetical (`(fn)(a)(b)` chains) and lower the run as one
      // value-call expression, popping the unused return value.
      if (child.name === "LuauParenthetical") {
        const callNodes: SyntaxNode[] = [child];
        let lastNode: SyntaxNode = child;
        let scan: SyntaxNode | null = child.nextSibling;
        while (scan) {
          while (scan && ASSIGNMENT_PAIR_BRIDGE.has(scan.name)) {
            scan = scan.nextSibling;
          }
          if (!scan || scan.name !== "LuauParenthetical") break;
          callNodes.push(scan);
          lastNode = scan;
          scan = scan.nextSibling;
        }
        if (callNodes.length > 1) {
          const callExpr = lowerExpressionFromNodes(callNodes, ctx);
          if (
            callExpr instanceof CallValueExpression ||
            callExpr instanceof FunctionCall
          ) {
            callExpr.shouldPopReturnedValue = true;
            appendBlockContent(
              result,
              wrapInWeave(
                [callExpr],
                { from: child.from, to: lastNode.to },
                ctx,
              ),
            );
            child = lastNode.nextSibling;
            continue;
          }
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
  // Inspect each target. If they're all plain `LuauVariableName`,
  // route through `MultiVariableAssignment` directly (fast path —
  // single ParsedObject, no temp expansion). If any target is a
  // property access (`a.x`, `a[k]`), fall through to the
  // temp-expansion path below: stash the RHS values into synthetic
  // locals, then emit per-target stores. Multi-target with mixed
  // property and variable targets is common in Luau (`a.x, b = …`,
  // `a[f()], b, a[f()+3] = f(), a, 'x'`) — this fixture shape is
  // attrib.luau lines 13, 15.
  const allSimple = multi.targets.every((t) => isSimpleVariableTarget(t));
  const firstRhs = lowerExpressionFromContainer(multi.op, ctx);
  const trailingExprs = multi.trailingExprGroups
    .map((nodes) => lowerExpressionFromNodes(nodes, ctx))
    .filter((e): e is NonNullable<typeof e> => e != null);
  const expressions = firstRhs ? [firstRhs, ...trailingExprs] : trailingExprs;

  if (allSimple) {
    const targetIdents: Identifier[] = [];
    for (const t of multi.targets) {
      const nameNode = getDescendent("LuauVariableName", t);
      if (!nameNode) return {};
      targetIdents.push(new Identifier(ctx.read(nameNode.from, nameNode.to)));
    }
    return wrapInWeave([
      new MultiVariableAssignment(targetIdents, expressions, false),
    ]);
  }

  // Mixed shape: stash each RHS slot into a synthetic local, then
  // emit per-target stores. Offset-tagged temp names keep multiple
  // multi-target assignments in the same function body from
  // colliding. The MultiVariableAssignment handles PackTuple +
  // UnpackTuple semantics — including spreading a multi-return f()
  // in the LAST RHS expression across as many temps as we declare.
  const offset = multi.targets[0]!.from;
  const tempIdents = multi.targets.map(
    (_, i) => new Identifier(`__mt_${offset}_${i}`),
  );
  const tempDecl = new MultiVariableAssignment(tempIdents, expressions, true);

  // Lua's "assignments with local conflicts" semantics (basic.luau
  // lines 53-55): ALL expressions — RHS values AND each property
  // target's base + subscript — evaluate before ANY store happens.
  // `local a, b = 1, {} a, b[a] = 43, -1` must store into `b[1]`
  // (the OLD a), not `b[43]`; `a[1], a = 43, -1` must store 43 into
  // the table `a` referenced BEFORE `a` is overwritten with -1. So
  // property targets stash their base + key into temps up front
  // (`preStores`), and the store phase references only temps.
  const preStores: ParsedObject[] = [];
  const writes: ParsedObject[] = [];
  for (let i = 0; i < multi.targets.length; i++) {
    const target = multi.targets[i]!;
    const tempRef = new VariableReference([tempIdents[i]!]);
    const decomposed = decomposeTargetBaseAndKey(target, ctx);
    if (decomposed) {
      const baseTemp = new Identifier(`__mt_base_${offset}_${i}`);
      const keyTemp = new Identifier(`__mt_key_${offset}_${i}`);
      preStores.push(
        new VariableAssignment({
          variableIdentifier: baseTemp,
          assignedExpression: decomposed.base,
          isTemporaryNewDeclaration: true,
        }),
        new VariableAssignment({
          variableIdentifier: keyTemp,
          assignedExpression: decomposed.key,
          isTemporaryNewDeclaration: true,
        }),
      );
      writes.push(
        new StorePropertyAssignment(
          new VariableReference([baseTemp]),
          new VariableReference([keyTemp]),
          tempRef,
        ),
      );
      continue;
    }
    const write = buildTargetWrite(target, tempRef, ctx);
    if (write) writes.push(write);
  }
  return wrapInWeave([tempDecl, ...preStores, ...writes]);
}

// True when the LuauAccessPath consists of a single LuauVariable
// segment (no property accessor, no indexer, no function call).
function isSimpleVariableTarget(accessPath: SyntaxNode): boolean {
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  const root = content ?? accessPath;
  let part: SyntaxNode | null = null;
  let child = root.firstChild;
  while (child) {
    if (child.name === "LuauAccessPart") {
      if (part) return false; // more than one part — not simple
      part = child;
    }
    child = child.nextSibling;
  }
  if (!part) return false;
  return part.firstChild?.name === "LuauVariable";
}

// Build a write that stores `valueExpr` into the target (variable or
// property access). Mirrors `lowerReassignment` and
// `lowerPropertyTargetAssignment` for the simple plain-`=` shape but
// driven by a pre-computed value expression (the temp slot) instead
// of lowering the RHS from a sibling op node.
function buildTargetWrite(
  accessPath: SyntaxNode,
  valueExpr: Expression,
  ctx: LowerContext,
): ParsedObject | null {
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  const root = content ?? accessPath;
  const parts: SyntaxNode[] = [];
  let child = root.firstChild;
  while (child) {
    if (child.name === "LuauAccessPart") parts.push(child);
    child = child.nextSibling;
  }
  if (parts.length === 0) return null;

  // Single-segment variable target → `VariableAssignment` reassign.
  if (parts.length === 1) {
    const inner = parts[0]!.firstChild;
    if (inner?.name !== "LuauVariable") return null;
    const nameNode =
      getDescendent("LuauVariableName", inner) ??
      getDescendent("LuauStdLibConstants", inner) ??
      getDescendent("LuauSelfKeyword", inner);
    if (!nameNode) return null;
    return new VariableAssignment({
      variableIdentifier: new Identifier(ctx.read(nameNode.from, nameNode.to)),
      assignedExpression: valueExpr,
      isTemporaryNewDeclaration: false,
    });
  }

  // Multi-segment target — build base + key for StorePropertyAssignment.
  const decomposed = decomposeTargetBaseAndKey(accessPath, ctx);
  if (!decomposed) return null;
  return new StorePropertyAssignment(
    decomposed.base,
    decomposed.key,
    valueExpr,
  );
}

// Decompose a property-access target (`b[a]`, `obj.field`, `a.b.c[k]`)
// into a base GET expression (everything before the final segment) and
// a key expression (the final `.name` as a string literal, or the
// `[expr]` indexer lowered). Returns null for single-segment variable
// targets and anything unrecognized — callers fall back to the simple
// variable-write path. Used by `lowerMultiTargetReassignment` to stash
// base + key into temps BEFORE any store happens (Lua's multi-
// assignment conflict semantics) and by `buildTargetWrite` for the
// plain inline store.
function decomposeTargetBaseAndKey(
  accessPath: SyntaxNode,
  ctx: LowerContext,
): { base: Expression; key: Expression } | null {
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  const root = content ?? accessPath;
  const parts: SyntaxNode[] = [];
  let child = root.firstChild;
  while (child) {
    if (child.name === "LuauAccessPart") parts.push(child);
    child = child.nextSibling;
  }
  if (parts.length < 2) return null;
  // Call-rooted targets (`f(a)[2] = 10` — attrib.luau line 85) have a
  // FunctionCall first part the segment-walk below can't root a
  // VariableReference on. The expression lowerer already builds the
  // full read chain for any path shape; an IndexExpression's
  // base/key are exactly the store's base/key. Walk-based
  // decomposition stays first because it's also used by paths the
  // expression lowerer would mis-handle as a READ-then-store.
  const decomposeViaExpression = (): {
    base: Expression;
    key: Expression;
  } | null => {
    const expr = lowerExpressionFromNodes([accessPath], ctx);
    if (expr instanceof IndexExpression) {
      return { base: expr.baseExpression, key: expr.keyExpression };
    }
    return null;
  };

  // Key comes from the final segment (either a `.name` accessor or a
  // `[expr]` indexer).
  const finalPart = parts[parts.length - 1]!;
  const finalInner = finalPart.firstChild;
  if (!finalInner) return null;

  let keyExpr: Expression | null = null;
  if (finalInner.name === "LuauPropertyAccessor") {
    const nameNode =
      getDescendent("LuauPropertyName", finalInner) ??
      getDescendent("LuauStdLibMethods", finalInner);
    if (!nameNode) return null;
    keyExpr = new StringExpression([
      new Text(ctx.read(nameNode.from, nameNode.to)),
    ]);
  } else if (finalInner.name === "LuauPropertyIndexer") {
    const indexerContent = findChildByName(
      finalInner,
      "LuauPropertyIndexer_content",
    );
    keyExpr = indexerContent
      ? lowerExpressionFromContainer(indexerContent, ctx)
      : null;
  } else {
    return decomposeViaExpression();
  }
  if (!keyExpr) return decomposeViaExpression();

  const baseExpr = buildBaseFromParts(parts.slice(0, -1), ctx);
  if (!baseExpr) return decomposeViaExpression();
  return { base: baseExpr, key: keyExpr };
}

// Build a value-chain expression for a property-target's base
// segments. Mirrors `lowerBaseFromParts` in
// `lowerPropertyTargetAssignment.ts` (kept inline to avoid the
// circular import — `lowerPropertyTargetAssignment.ts` already
// imports from this module via the expression lowerer).
function buildBaseFromParts(
  parts: SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  if (parts.length === 0) return null;
  const firstInner = parts[0]!.firstChild;
  if (firstInner?.name !== "LuauVariable") return null;
  const nameNode =
    getDescendent("LuauStdLibConstants", firstInner) ??
    getDescendent("LuauVariableName", firstInner) ??
    getDescendent("LuauSelfKeyword", firstInner);
  if (!nameNode) return null;
  let current: Expression = new VariableReference([
    new Identifier(ctx.read(nameNode.from, nameNode.to)),
  ]);
  for (let i = 1; i < parts.length; i++) {
    const inner = parts[i]!.firstChild;
    if (!inner) return null;
    if (inner.name === "LuauPropertyAccessor") {
      const propNameNode =
        getDescendent("LuauPropertyName", inner) ??
        getDescendent("LuauStdLibMethods", inner);
      if (!propNameNode) return null;
      current = new IndexExpression(
        current,
        new StringExpression([
          new Text(ctx.read(propNameNode.from, propNameNode.to)),
        ]),
      );
    } else if (inner.name === "LuauPropertyIndexer") {
      const indexerContent = findChildByName(
        inner,
        "LuauPropertyIndexer_content",
      );
      const key = indexerContent
        ? lowerExpressionFromContainer(indexerContent, ctx)
        : null;
      if (!key) return null;
      current = new IndexExpression(current, key);
    } else {
      return null;
    }
  }
  return current;
}

function appendBlockContent(
  result: ParsedObject[],
  block: CompiledBlock,
): void {
  if (!block.content) return;
  for (const obj of block.content) {
    if (obj instanceof Weave) {
      const wrapperMetadata = obj.ownDebugMetadata;
      for (const inner of obj.content) {
        if (wrapperMetadata && !inner.ownDebugMetadata) {
          inner.debugMetadata = wrapperMetadata;
        }
        result.push(inner);
      }
    } else {
      result.push(obj);
    }
  }
}
