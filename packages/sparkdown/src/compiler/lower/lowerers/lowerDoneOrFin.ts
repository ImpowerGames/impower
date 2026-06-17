import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { CompiledBlock, InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
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

const IGNORABLE_SIBLINGS: ReadonlySet<string> = new Set([
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

function lower(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  target: "DONE" | "END",
): CompiledBlock {
  const divert = new Divert([new Identifier(target)], []);
  const block = wrapInWeave([divert]);

  const unreachable = findUnreachableRange(nodeRef.node);
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
