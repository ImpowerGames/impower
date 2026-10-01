import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { CompiledBlock,InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

// `done` / `fin` — bare-keyword aliases for the terminator diverts.
// `done` lowers to `Divert([DONE])` (= scene/branch return; auto-DONE
// is the runtime's idle-flow handler). `fin` lowers to `Divert([END])`
// (= story termination). After either keyword the flow can't continue
// in this scope, so any sibling statement that follows (before the
// scope's closing `end`) is unreachable. We emit a single Hint-severity
// diagnostic with the LSP `Unnecessary` tag covering the unreachable
// range — VS Code renders that as greyed-out text so the author can
// see the dead code at a glance.

const UNNECESSARY_TAG = 1; // LSP DiagnosticTag.Unnecessary

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

// Walks forward from the `done` / `fin` node looking for the first
// non-whitespace sibling. Returns it (the start of the unreachable
// range) along with the last non-whitespace sibling before the
// scope's closing `end` (the end of the unreachable range), or
// `null` if there's nothing unreachable.
function findUnreachableRange(
  decl: SyntaxNode,
): { from: SyntaxNode; to: SyntaxNode } | null {
  let cur = decl.nextSibling;
  let first: SyntaxNode | null = null;
  let last: SyntaxNode | null = null;
  while (cur) {
    // Stop at the enclosing scene/branch's closing `end`. The `end`
    // keyword itself is a structural marker, not "unreachable code"
    // — so anything past it isn't ours to flag.
    if (cur.name === "LuauEndKeyword") break;
    // A new `Scene` / `Branch` declaration also implicitly ends the
    // current scope (the previous scene's missing-end is its own
    // diagnostic from `validateScene`; we just stop here).
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

// The `unreachable` read (`LoweringRead`) of a `done` or `fin` and the range
// it found: the range's lines counted from the keyword's own line, and its
// columns, or nothing. That fixes the hint of a statement carried unchanged.
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

/** The `unreachable` read of the `done` or `fin` lowered from `node`, as the
 *  document now answers it. */
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
  // What follows the keyword is outside its statement, so an edit below it
  // can move the hint while the statement is carried unchanged.
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
