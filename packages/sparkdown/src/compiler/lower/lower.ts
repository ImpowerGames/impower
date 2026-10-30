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
  continuesIntersection,
  hasTypeOperatorLineOwner,
  reportUnownedTypeOperatorLine,
  startsWithReturnTypeMembers,
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
import { validateTopLevelDeclaration } from "./utils/validateTopLevelDeclaration";
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
import { CONSTRAINT_GENERATOR_RECURSION_LIMIT } from "../typecheck/ConstraintGenerator";
import { offsetAt, readBlockAst } from "./utils/luauAst";
import { forwardBlockDiagnostics } from "./utils/unwrapBlock";
import {
  closeStatement,
  openStatement,
  type BodyShape,
  type StatementShape,
} from "./utils/statementShape";

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
  if (LUAU_STATEMENT_NODES.has(nodeRef.name)) {
    return lowerLuauStatementNode(nodeRef.node, ctx);
  }
  const misplaced = validateTopLevelDeclaration(nodeRef.node, ctx);
  if (misplaced) {
    ctx.diagnostics?.push(misplaced);
    const block = lowerNode(nodeRef, ctx);
    return block && { diagnostics: block.diagnostics };
  }
  return lowerNode(nodeRef, ctx);
}

function lowerNode(
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
    case "LuauUntilCondition":
    case "LuauSparkdownExplicitUntilCondition":
      return {};
    case "LuauStrayUntilStatement":
      return {};
    case "LuauEndKeyword":
      return {};
    case "Tags":
    case "SparkdownExplicitTags":
      return lowerTags(nodeRef, ctx);
    default:
      return undefined;
  }
}

const TREE_LOWERED_STATEMENTS = nodeNameSet(["LuauSparkdownChooseBlock"]);

export function lowerStatements(
  parent: SyntaxNode | null,
  ctx: LowerContext,
  skipNames: ReadonlySet<string> = new Set(),
  body?: BodyShape,
): ParsedObject[] {
  if (!parent) return [];
  const depth = ctx.blockDepth ?? 0;
  if (depth >= CONSTRAINT_GENERATOR_RECURSION_LIMIT) return [];
  ctx.blockDepth = depth + 1;
  try {
    return lowerBlockStatements(parent, ctx, skipNames, body);
  } finally {
    ctx.blockDepth = depth;
  }
}

function lowerBlockStatements(
  parent: SyntaxNode,
  ctx: LowerContext,
  skipNames: ReadonlySet<string>,
  body: BodyShape | undefined,
): ParsedObject[] {
  const result: ParsedObject[] = [];
  const recording = body && ctx.statementStack ? body : undefined;
  const preamble = ctx as { inChoosePreamble?: boolean };
  const inPreamble = preamble.inChoosePreamble === true;
  let first = parent.firstChild;
  const qualifier = leadingReturnTypeQualifier(parent);
  if (qualifier) {
    reportExtraTypeQualifiers(
      qualifier.returnType,
      continuationParts(qualifier.lines),
      ctx,
    );
    first = qualifier.lines[qualifier.lines.length - 1]?.nextSibling ?? null;
  }
  const afterType = startsWithReturnTypeMembers(parent, first);
  const nodes: SyntaxNode[] = [];
  for (let child = first; child; child = child.nextSibling) {
    if (!skipNames.has(child.name)) nodes.push(child);
  }
  const indexOf = new Map<string, number>();
  nodes.forEach((node, i) => indexOf.set(`${node.name}@${node.from}`, i));
  const nodeIndex = (ref: { name: string; from: number }) =>
    indexOf.get(`${ref.name}@${ref.from}`);
  const beginning: LuauStatementSource[][] = nodes.map(() => []);
  const readFrom = (from: number) => {
    const read = readBlockAst(nodes.slice(from), ctx, afterType && from === 0);
    for (let i = from; i < nodes.length; i++) beginning[i] = [];
    for (const source of read?.unit.statements ?? []) {
      const at = source.nodes[0] && nodeIndex(source.nodes[0]);
      if (at !== undefined) beginning[at]!.push(source);
    }
    return read;
  };
  let reading = readFrom(0);
  let rereadAt: number | undefined;
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
      if (isLineContinuation(node) || node.name === "LuauTypeOperatorLineContinuation") {
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
  const taken = new Set<number>();
  let previous: AstStat | undefined;
  for (let i = 0; i < nodes.length; i++) {
    const child = nodes[i]!;
    if (rereadAt === i) {
      rereadAt = undefined;
      reading = readFrom(i);
    }
    let readTo = i;
    const statements =
      reading && !TREE_LOWERED_STATEMENTS.has(child.name)
        ? readStatements(child, beginning[i]!, reading.source, ctx).map(
            (statement) => {
              for (const ref of statement.nodes) {
                readTo = Math.max(readTo, nodeIndex(ref) ?? i);
              }
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
    const ownedTypeLine =
      child.name === "LuauTypeOperatorLineContinuation" &&
      (taken.has(i) || hasTypeOperatorLineOwner(child));
    if (
      child.name === "LuauTypeOperatorLineContinuation" &&
      !(ownedTypeLine && statements.length > 0)
    ) {
      if (!ownedTypeLine && !continuesIntersection(child)) {
        reportUnownedTypeOperatorLine(child, ctx);
      }
      continue;
    }
    if (isLineContinuation(child)) {
      if (!taken.has(i)) reportUntakenContinuation(child, previous, ctx);
      continue;
    }
    const start = result.length;
    const shape = recording ? openStatement(ctx, child) : undefined;
    let last: SyntaxNode = child;
    try {
      if (statements.length > 0 && reading) {
        last = nodes[readTo]!;
        const source = reading.source;
        const lowerRead = (c: LowerContext) =>
          lowerLuauStatementsAt(child, statements, { node: child, source }, c);
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
  return result;
}

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
