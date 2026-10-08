import { nodeNameSet } from "../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { Choice } from "../../inkjs/compiler/Parser/ParsedHierarchy/Choice";
import { memoOf } from "../../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { AstStat, AstStatIf } from "../typecheck/Ast";
import type {
  LuauStatementSource,
  LuauSyntaxError,
} from "../typecheck/readLuauAst";
import type { CompiledBlock } from "../classes/annotators/CompilationAnnotator";
import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import type { SparkdownNodeName } from "../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "./context";
import {
  continuationParts,
  continuesInVain,
  isLineContinuation,
  leadingReturnTypeQualifier,
  reportExtraTypeQualifiers,
  reportUntakenContinuation,
  hasTypeUnionLineOwner,
  reportUnownedTypeUnionLine,
} from "./utils/lineContinuation";
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
import { lowerGlue } from "./lowerers/lowerGlue";
import { lowerLabelAnchor } from "./lowerers/lowerLabelAnchor";
import { lowerInclude } from "./lowerers/lowerInclude";
import { lowerRun } from "./lowerers/lowerRun";
import { lowerLuauDefine } from "./lowerers/lowerLuauDefine";
import { lowerLuauStyle } from "./lowerers/lowerLuauStyle";
import { lowerLuauStructDefine } from "./lowerers/lowerLuauStructDefine";
import { lowerLuauUI, lowerLuauScreen } from "./lowerers/lowerLuauUI";
import { lowerLuauExternalDeclaration } from "./lowerers/lowerLuauExternalDeclaration";
import {
  LUAU_STATEMENT_NODES,
  lowerLuauStatementNode,
  readStatements,
  lowerLuauStatementsAt,
  statementRange,
  takesLines,
} from "./lowerers/lowerLuauStatement";
import { lowerScene } from "./lowerers/lowerScene";
import { lowerSparkdownConditionalAlternatorBlock } from "./lowerers/lowerSparkdownConditionalAlternatorBlock";
import { lowerSparkdownChooseBlock } from "./lowerers/lowerSparkdownChooseBlock";
import { lowerSparkdownSequentialAlternatorBlock } from "./lowerers/lowerSparkdownSequentialAlternatorBlock";
import { lowerTags } from "./lowerers/lowerTags";
import { lowerThread } from "./lowerers/lowerThread";
import {
  headerLineRange,
  stampDebugMetadata,
  statementBounds,
} from "./utils/debugMetadata";
import { offsetAt, readBlockAst } from "./utils/luauAst";
import { forwardBlockDiagnostics } from "./utils/unwrapBlock";
import {
  closeStatement,
  openStatement,
  type BodyShape,
  type StatementShape,
} from "./utils/statementShape";

// Nodes whose lowerer returns a weave holding one control-flow statement (an
// `if`, or an alternator such as `match`) with its arms nested inside it.
const BLOCK_STATEMENTS: ReadonlySet<string> = nodeNameSet([
  "LuauSparkdownIfBlock",
  "LuauIfBlock",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
]);

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
    stampStatement(
      block.content,
      BLOCK_STATEMENTS.has(nodeRef.name),
      nodeRef.from,
      nodeRef.to,
      ctx,
    );
  }
  return block;
}

/**
 * Stamps a statement's objects with the range `[from, to)` it was lowered
 * from, which `program.pathLocations` and the runtime's error positions
 * read.
 *
 * Trailing whitespace and newlines are clamped off the range, so a beat's
 * `endLineNumber` is its last VISIBLE content line, not a blank or the start
 * of the following construct. Several grammar nodes (notably
 * `BlockDialogue`) consume a trailing blank line and end at the start of the
 * next line, which over-extends the stamped range one line PAST the content.
 * That made a dialogue beat's pathLocation claim the action line right after
 * it (e.g. `RAFFLES:` beat ending on the `Danby picks…` action line), so
 * clicking that action previewed the dialogue. Leading spaces and tabs are
 * clamped off too: a statement's node starts with its line's indentation,
 * and its range starts at its first character.
 *
 * A block statement's weave (`isBlockStatement`) is unwrapped wherever it is
 * placed, as an explicit statement's is (see `lowerExplicitStatement`), so
 * the weave's range would not reach the statement it holds. Give the
 * statement the range of its header line, so a diagnostic raised in its
 * condition, such as an unknown name, is reported on that line rather than
 * on the enclosing scene or branch. Only the header: the lines of its arms
 * own their own paths, and a range covering them would make
 * `program.pathLocations` resolve those lines to the statement instead.
 */
export function stampStatement(
  content: ParsedObject[],
  isBlockStatement: boolean,
  rangeFrom: number,
  rangeTo: number,
  ctx: LowerContext,
): void {
  const { from, to } = statementBounds(rangeFrom, rangeTo, ctx);
  if (isBlockStatement) {
    const header = headerLineRange(from, to, ctx);
    for (const obj of content) {
      if (obj instanceof Weave) {
        stampDebugMetadata(obj.content, header.from, header.to, ctx);
      }
    }
  }
  stampDebugMetadata(content, from, to, ctx);
}

function lowerInner(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock | undefined {
  // Luau's statements are read by the converter, which decides where each
  // ends and what it holds.
  if (LUAU_STATEMENT_NODES.has(nodeRef.name)) {
    return lowerLuauStatementNode(nodeRef.node, ctx);
  }
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
    case "LuauSparkdownExplicitInterpolatedStringExpression":
    case "LuauFunctionCallShorthand":
    case "LuauSparkdownExplicitFunctionCallShorthand":
      // Bare `{ expr }` / `{{fn}}` lines at top level — the grammar matches
      // these directly (not wrapped in ImplicitAction the way
      // `text {expr} text` lines are). Sparkdown handles them via
      // `lowerExpressionFromContainer` (which applies the `{{...}}`
      // call-shorthand coercion when the node is the shorthand).
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
    case "Glue":
      return lowerGlue(nodeRef, ctx);
    case "LuauSparkdownChooseBlock":
      return lowerSparkdownChooseBlock(nodeRef, ctx);
    case "LuauSparkdownConditionalAlternatorBlock":
    case "LuauSparkdownSingleLineConditionalAlternatorBlock":
      return lowerSparkdownConditionalAlternatorBlock(nodeRef, ctx);
    case "LuauSparkdownSequentialAlternatorBlock":
    case "LuauSparkdownSingleLineSequentialAlternatorBlock":
      return lowerSparkdownSequentialAlternatorBlock(nodeRef, ctx);
    case "LuauDefine":
      return lowerLuauDefine(nodeRef, ctx);
    case "LuauStyle":
      return lowerLuauStyle(nodeRef, ctx);
    case "LuauLayout":
      return lowerLuauUI(nodeRef, ctx, "layout");
    case "LuauScreen":
      return lowerLuauScreen(nodeRef, ctx);
    case "LuauComponent":
      return lowerLuauUI(nodeRef, ctx, "component");
    case "LuauAnimation":
      return lowerLuauStructDefine(nodeRef, ctx, "animation");
    case "LuauTheme":
      return lowerLuauStructDefine(nodeRef, ctx, "theme");
    case "LuauMorph":
      return lowerLuauStructDefine(nodeRef, ctx, "morph");
    case "LuauExternalDeclaration":
      return lowerLuauExternalDeclaration(nodeRef, ctx);
    case "LuauUntilStatement":
    case "LuauSparkdownExplicitUntilStatement":
      // A `repeat` loop reads the `until` line after it as its own
      // (`lowerLuauStatementNode`), so the line lowers to nothing here.
      return {};
    case "LuauEndKeyword":
      // Stand-alone `end` keyword (the scene/branch/function terminator).
      // It's purely a structural marker — no runtime content.
      return {};
    case "Tags":
    case "SparkdownExplicitTags":
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

// The statement nodes the converter reads (for the type checker) that
// lower from their node: Sparkdown's own blocks.
const TREE_LOWERED_STATEMENTS = nodeNameSet(["LuauSparkdownChooseBlock"]);

/**
 * Lowers the statements of a block: the children of `parent`, except those
 * named in `skipNames` (a block's own header parts, such as an `if`'s
 * condition), merged into one flat list. A statement's weave is unwrapped:
 * the caller wraps the list in a Weave (or a ContentList, etc.).
 *
 * The block's Luau is read by the converter, which records each statement
 * with the children it was read from: the child it begins in, and the
 * children after it that it continues into (a line that begins with `.` or
 * an operator, the values after a line-ending comma, a `repeat`'s `until`).
 * Each child that statements begin in is lowered as those statements, the
 * children they continue into are skipped, and every other child is a
 * Sparkdown statement (a display line, a choice, a divert), lowered as its
 * node. A line that continues the value before it but that no statement
 * takes is reported, as is a union member line that continues no type.
 *
 * Each statement of a block's body is recorded with the objects it lowered
 * to (see `StatementShape`), when the context keeps shapes.
 */
export function lowerStatements(
  parent: SyntaxNode | null,
  ctx: LowerContext,
  skipNames: ReadonlySet<string> = new Set(),
  body?: BodyShape,
): ParsedObject[] {
  if (!parent) return [];
  // The block is on the context's block stack while its statements lower:
  // what its `local`s hide is undone when it ends (`blockEndStack`). No
  // frame is added for it, since a block nests this function once per level.
  ctx.blockEndStack?.push([]);
  const result: ParsedObject[] = [];
  const recording = body && ctx.statementStack ? body : undefined;
  // A block of a `choose` block's preamble (an `if` branch, a `do` block, a
  // loop's body) is the preamble only up to its first choice: the statements
  // after a choice are that choice's body (`inlineChoiceBranches`), so a
  // `choose` block written there is a block of its own, not one that offers
  // its choices with the preamble's (#1622). The preamble resumes when the
  // block ends.
  const preamble = ctx as { inChoosePreamble?: boolean };
  const inPreamble = preamble.inChoosePreamble === true;
  let first = parent.firstChild;
  // A function body's first lines may qualify the name its return type ends
  // with (`function f(): types` then `.Button`); they are part of the type.
  const qualifier = leadingReturnTypeQualifier(parent);
  if (qualifier) {
    reportExtraTypeQualifiers(
      qualifier.returnType,
      continuationParts(qualifier.lines),
      ctx,
    );
    first = qualifier.lines[qualifier.lines.length - 1]?.nextSibling ?? null;
  }
  const nodes: SyntaxNode[] = [];
  for (let child = first; child; child = child.nextSibling) {
    if (!skipNames.has(child.name)) nodes.push(child);
  }
  // The block's statements, read from its children from `from` on, and the
  // statements that begin in each child, by the child's index.
  const indexOf = new Map<string, number>();
  nodes.forEach((node, i) => indexOf.set(`${node.name}@${node.from}`, i));
  const nodeIndex = (ref: { name: string; from: number }) =>
    indexOf.get(`${ref.name}@${ref.from}`);
  const beginning: LuauStatementSource[][] = nodes.map(() => []);
  const readFrom = (from: number) => {
    const read = readBlockAst(nodes.slice(from), ctx);
    for (let i = from; i < nodes.length; i++) beginning[i] = [];
    for (const source of read?.unit.statements ?? []) {
      const at = source.nodes[0] && nodeIndex(source.nodes[0]);
      if (at !== undefined) beginning[at]!.push(source);
    }
    return read;
  };
  let reading = readFrom(0);
  // A child where a statement before it stopped short (`cutAt`), which is
  // read again from there.
  let rereadAt: number | undefined;
  // The first child after `i` that the statement continues into only by
  // Luau's error recovery: the converter's reading fails at the child's
  // first token (`x = if true then 1` before `x = 6` at column 0, whose `x`
  // Luau reads as the missing `else`), and the child is a statement of its
  // own to the grammar. The statement stops short of it, and the child is
  // read again as the start of the block's remaining statements. A line
  // that continues the value before it is left to the continuation reports.
  const cutAt = (
    statement: LuauStatementSource,
    i: number,
    errors: readonly LuauSyntaxError[],
  ): number | undefined => {
    let cut: number | undefined;
    for (const ref of statement.nodes) {
      const at = nodeIndex(ref);
      if (at === undefined || at <= i) continue;
      const node = nodes[at]!;
      if (isLineContinuation(node) || node.name === "LuauTypeUnionLineContinuation") {
        continue;
      }
      const text = ctx.read(node.from, node.to);
      const first = node.from + text.length - text.trimStart().length;
      if (errors.some((e) => offsetAt(e.location.begin, ctx) === first)) {
        if (cut === undefined || at < cut) cut = at;
      }
    }
    return cut;
  };
  // The children a statement before them continues into (`takesLines`).
  const taken = new Set<number>();
  // The last statement lowered, which a line that continues no value
  // continues in vain.
  let previous: AstStat | undefined;
  for (let i = 0; i < nodes.length; i++) {
    const child = nodes[i]!;
    if (rereadAt === i) {
      rereadAt = undefined;
      reading = readFrom(i);
    }
    // A `choose` block is Sparkdown's own, lowered from its node.
    const statements =
      reading && !TREE_LOWERED_STATEMENTS.has(child.name)
        ? readStatements(child, beginning[i]!, reading.source, ctx).map(
            (statement) => {
              const cut = cutAt(statement, i, reading!.source.errors);
              if (cut === undefined) return statement;
              if (rereadAt === undefined || cut < rereadAt) rereadAt = cut;
              return {
                ...statement,
                nodes: statement.nodes.filter((n) => (nodeIndex(n) ?? i) < cut),
              };
            },
          )
        : [];
    if (taken.has(i) && statements.length === 0) continue;
    if (child.name === "LuauTypeUnionLineContinuation") {
      // A union member line after a comment line: types do not reach the
      // runtime, and the declaration before it took it. One that continues
      // no type is Luau's error.
      if (!taken.has(i) && !hasTypeUnionLineOwner(child)) {
        reportUnownedTypeUnionLine(child, ctx);
      }
      continue;
    }
    if (isLineContinuation(child)) {
      // A continuation line that no statement before it took.
      if (!taken.has(i)) reportUntakenContinuation(child, previous, ctx);
      continue;
    }
    const start = result.length;
    const shape = recording ? openStatement(ctx, child) : undefined;
    let last: SyntaxNode = child;
    try {
      if (statements.length > 0 && reading) {
        const lastIndex = Math.max(
          i,
          ...statements.flatMap((s) => s.nodes.map((n) => nodeIndex(n) ?? i)),
        );
        last = nodes[lastIndex]!;
        const source = reading.source;
        const lowerRead = (c: LowerContext) =>
          lowerLuauStatementsAt(child, statements, { node: child, source }, c);
        // Through the statement memo, as a statement lowered from its node
        // is (`lowerBodyStatement`): its syntax runs over every node it reads.
        const memo = shape ? ctx.statementMemo : undefined;
        const block =
          (memo
            ? memo.lowerStatement(child as GrammarSyntaxNode<SparkdownNodeName>, ctx, shape!, lowerRead, last.to)
            : undefined) ??
          lowerRead(ctx);
        if (
          block.content &&
          statements.length === 1 &&
          !memoOf(block.content[0])
        ) {
          const statement = statements[0]!;
          const range = statementRange(
            statement.statement,
            statement.nodes.map((n) => nodes[nodeIndex(n) ?? i]!),
            ctx,
          );
          stampStatement(
            block.content,
            statement.statement instanceof AstStatIf,
            range.from,
            range.to,
            ctx,
          );
        }
        appendBlockContent(result, block, ctx);
        for (const statement of statements) {
          if (!takesLines(statement.statement)) continue;
          previous = statement.statement;
          for (const ref of statement.nodes) {
            const at = nodeIndex(ref);
            if (at === undefined || at === i) continue;
            const node = nodes[at]!;
            if (
              isLineContinuation(node) &&
              continuesInVain(node, reading.source.errors, ctx)
            ) {
              continue;
            }
            taken.add(at);
          }
        }
      } else {
        const block = lowerBodyStatement(child as GrammarSyntaxNode<SparkdownNodeName>, ctx, shape);
        if (block) appendBlockContent(result, block, ctx);
      }
    } finally {
      if (shape) {
        closeStatement(ctx, shape, recording!, last, result, start);
      }
    }
    if (inPreamble && result.slice(start).some((obj) => obj instanceof Choice)) {
      preamble.inChoosePreamble = false;
    }
  }
  if (inPreamble) {
    preamble.inChoosePreamble = true;
  }
  ctx.blockEndStack?.pop()?.forEach((end) => end());
  return result;
}

/**
 * Lowers a statement of a block's body that lowers from its own node, whose
 * shape `shape` is open on the statement stack when shapes are recorded:
 * through the statement memo of the node being lowered when the context
 * has one, which serves the statement from its memo when the parse did not
 * rebuild it and every read its last lowering made reads the same
 * (`statementMemo.ts`, #656), and otherwise records what it reads.
 */
export function lowerBodyStatement(
  child: GrammarSyntaxNode<SparkdownNodeName>,
  ctx: LowerContext,
  shape: StatementShape | undefined,
): CompiledBlock | undefined {
  const memo = ctx.statementMemo;
  if (!memo || !shape) {
    return lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
  }
  return memo.lowerStatement(child, ctx, shape, (recorded) =>
    lower(child as unknown as SparkdownSyntaxNodeRef, recorded),
  );
}

// Unwraps a nested statement's block into `result`. The block's own
// diagnostics move to `ctx.diagnostics`, where the chunk-level annotator
// collects them, since the nested block itself is discarded.
function appendBlockContent(
  result: ParsedObject[],
  block: CompiledBlock,
  ctx: LowerContext,
): void {
  forwardBlockDiagnostics(block, ctx);
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
