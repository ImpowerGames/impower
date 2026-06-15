import { type SyntaxNode } from "@lezer/common";
import { ErrorType, SourceMetadata } from "../../../inkjs/engine/Error";
import { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";

// LSP `DiagnosticTag.Unnecessary` — VS Code renders the affected
// range faded/struck-through so the user sees at a glance that the
// flagged text can be deleted.
const DIAGNOSTIC_TAG_UNNECESSARY = 1;

// Emit an Information-severity diagnostic when an `& ...` explicit-
// statement appears inside a function body. The `&` prefix is only
// needed at top-level (outside any function) to disambiguate Luau
// statements from display text — inside a function body, statement-
// level forms (bare calls, reassignments, declarations) compile
// identically without it.
//
// Tagged `Unnecessary` so editors style the prefix faded/struck-
// through. The formatter will also strip the prefix automatically.
//
// Returns an empty array when no diagnostic applies (outside a
// function, or the node isn't an explicit-statement node).
export function validateExplicitStatement(
  stmtNode: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  if (!isInsideFunctionBody(stmtNode)) return [];
  // Range the diagnostic on the `& ` prefix itself, not the whole
  // statement. The `_begin` capture spans optional leading ws + the
  // `&` mark + required trailing ws — perfect for "this is the part
  // you can delete."
  const beginNode =
    findChildByName(stmtNode, "LuauExplicitStatement_begin") ?? stmtNode;
  return [
    {
      message:
        "The `&` discard prefix is unnecessary inside function bodies — statement-level Luau forms compile the same without it. Reserve `&` for top-level main-flow code where it disambiguates Luau from display text.",
      severity: ErrorType.Information,
      source: makeSource(beginNode, ctx),
      tags: [DIAGNOSTIC_TAG_UNNECESSARY],
    },
  ];
}

// True iff `node` has an ancestor `LuauFunctionDefinition` somewhere
// up the parent chain. Used to decide whether `&` is redundant.
//
// We walk via `node.parent` rather than peeking at node names because
// the tree-sitter parent chain is the authoritative scoping link;
// alternative approaches (e.g. checking if any sibling earlier on
// the same line declares a `function`) miss multi-line declarations.
function isInsideFunctionBody(node: SyntaxNode): boolean {
  let ancestor: SyntaxNode | null = node.parent;
  while (ancestor) {
    if (ancestor.name === "LuauFunctionDefinition") return true;
    ancestor = ancestor.parent;
  }
  return false;
}

function makeSource(node: SyntaxNode, ctx: LowerContext): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(node.from) + 1,
    endLineNumber: ctx.lineNumber(node.to) + 1,
    startCharacterNumber: ctx.characterNumber(node.from) + 1,
    endCharacterNumber: ctx.characterNumber(node.to) + 1,
  };
}
