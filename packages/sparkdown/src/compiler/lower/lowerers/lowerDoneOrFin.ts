import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { CompiledBlock,InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

const UNNECESSARY_TAG = 1;

const IGNORABLE_SIBLINGS: ReadonlySet<string> = nodeNameSet([
  "Newline",
  "Whitespace",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "EndOfLine",
  "Annotation",
  "LuauComment",
]);

function findUnreachableRange(
  decl: SyntaxNode,
): { from: SyntaxNode; to: SyntaxNode } | null {
  let cur = decl.nextSibling;
  let first: SyntaxNode | null = null;
  let last: SyntaxNode | null = null;
  while (cur) {
    if (cur.name === "LuauEndKeyword") break;
    if (cur.name === "Scene" || cur.name === "Branch") break;
    if (!IGNORABLE_SIBLINGS.has(cur.name)) {
      if (!first) first = cur;
      last = cur;
    }
    cur = cur.nextSibling;
  }
  if (!first || !last) return null;
  return { from: first, to: last };
}

function readOf(
  decl: SyntaxNode,
  range: { from: SyntaxNode; to: SyntaxNode } | null,
  ctx: Pick<LowerContext, "lineNumber" | "characterNumber">,
): string {
  if (!range) return "";
  const at = (pos: number) =>
    `${ctx.lineNumber(pos) - ctx.lineNumber(decl.from)}:${ctx.characterNumber(pos)}`;
  return `${at(range.from.from)}-${at(range.to.to)}`;
}

export function unreachableRead(
  node: SyntaxNode,
  ctx: Pick<LowerContext, "lineNumber" | "characterNumber">,
): string {
  return readOf(node, findUnreachableRange(node), ctx);
}

function lower(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  target: "DONE" | "END",
): CompiledBlock {
  const divert = new Divert([new Identifier(target)], []);
  const block = wrapInWeave([divert]);

  const unreachable = findUnreachableRange(nodeRef.node);
  ctx.recordRead?.({
    kind: "unreachable",
    value: readOf(nodeRef.node, unreachable, ctx),
    node: nodeRef.node.name,
    from: nodeRef.node.from,
  });
  if (unreachable) {
    const diagnostic: InkDiagnostic = {
      message: "Unreachable statement detected.",
      severity: ErrorType.Hint,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(unreachable.from.from) + 1,
        endLineNumber: ctx.lineNumber(unreachable.to.to) + 1,
        startCharacterNumber: ctx.characterNumber(unreachable.from.from) + 1,
        endCharacterNumber: ctx.characterNumber(unreachable.to.to) + 1,
      },
      tags: [UNNECESSARY_TAG],
    };
    block.diagnostics = [diagnostic];
  }
  return block;
}

export function lowerDoneStatement(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return lower(nodeRef, ctx, "DONE");
}

export function lowerFinStatement(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  return lower(nodeRef, ctx, "END");
}
