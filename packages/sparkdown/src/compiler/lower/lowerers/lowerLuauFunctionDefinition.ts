import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/engine/Error";
import { SourceMetadata } from "../../../inkjs/engine/Error";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import {
  CompiledBlock,
  InkDiagnostic,
} from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { lowerArguments } from "../utils/lowerArguments";

// `function name(args) BODY end` → Knot(name, [], args, isFunction=true) with
// the body content placed in the Knot's _rootWeave. parseIncrementally
// preserves this rootWeave when it sees a Knot with one already set.
//
// Anonymous function expressions (e.g. inside `return (...)`) are NOT
// dispatched here — only top-level named function declarations are. The
// expression lowerer treats anonymous functions as an unsupported primary
// for now.
//
// Function purity is enforced at lowering time. Sparkdown's `function ...
// end` is a pure-expression callable: the body returns a value and may
// not emit narrative (display lines), gate flow with choices, or
// redirect flow with diverts/threads. The pre-lowering check below walks
// the body's grammar-tree children, collecting a diagnostic per
// prohibited construct so authors see the exact source position. This
// matches the design recorded in `DIVERGENCES.md > "Functions are
// expression-only"` — content that would yield to the surrounding flow
// is rejected at compile time rather than silently dropped.

const FUNCTION_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauFunctionDeclarationName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
]);

// Function bodies are Luau-expression contexts: the grammar parses bare
// display text as `LuauAccessPath` (variable references), `choose` as a
// `LuauVariableName`, and `-> target` as a `LuauDivertTargetLiteral`
// (divert-target *value*, not a divert action). So the prohibition is
// enforced by recognizing constructs that *look like* the prohibited
// shapes once they've been Luau-parsed — and by flagging access-path
// nodes that appear at statement position without being part of a
// legitimate Luau statement form (assignment, return, explicit-`&`
// call, etc.).

// Set of node names that are legitimate top-level statement shapes
// inside a function body. Anything not in this set, when found as a
// direct child of `LuauFunctionDefinition_content`, is a candidate for
// a purity diagnostic. Wrapper / whitespace / metadata children are
// also accepted (they're inert).
const LEGITIMATE_FUNCTION_BODY_CHILDREN: ReadonlySet<string> = new Set([
  // Function declaration metadata (already handled by FUNCTION_BODY_SKIP).
  "LuauFunctionDeclarationName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
  // Real statement shapes.
  "LuauReturnStatement",
  "LuauVariableDefinition",
  "LuauAssignmentOperation",
  // Implicit-assignment wrapper (`x = expr` without a `local` /
  // `store` prefix). The grammar bundles the access-path LHS with the
  // assignment operator under this single statement node — accept it
  // here as one legitimate child.
  "LuauImplicitAssignmentStatement",
  "LuauIfBlock",
  "LuauForLoop",
  "LuauWhileLoop",
  "LuauRepeatLoop",
  "LuauDoBlock",
  "LuauExplicitStatement",
  "LuauImplicitStatement",
  "LuauFunctionDefinition",
  "LuauBreakStatement",
  "LuauContinueStatement",
  // Whitespace / structural separators.
  "Indent",
  "ExtraWhitespace",
  "Newline",
  "Whitespace",
]);

// `LuauAccessPath` at function-body statement position is special: it
// *can* legitimately appear as the LHS of an implicit-assignment pair
// (`x = expr`). `lowerStatements` recognizes that case by pairing
// `LuauAccessPath` with a following `LuauAssignmentOperation`. We
// mirror that pairing here so we don't false-positive on assignments.

// Classify each prohibited statement-position child into a category so
// the diagnostic message can name the source-level intent the author
// most likely had:
//   - `LuauDivertTargetLiteral` → "diverts"
//   - everything else (bare `LuauAccessPath`, etc.) → "display text"
//     (the most common cause of misparses inside a function body —
//     `choose` is read as a variable name, `Hello world` as two
//     variable refs, etc., all of which surface as access paths).
function categorize(nodeName: string): string {
  if (nodeName === "LuauDivertTargetLiteral") {
    return "Functions may not contain diverts";
  }
  return "Functions may not contain display text";
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

const ASSIGNMENT_PAIR_BRIDGE: ReadonlySet<string> = new Set([
  "ExtraWhitespace",
  "Newline",
  "Whitespace",
]);

function findAssignmentOperationAfter(
  accessPath: SyntaxNode,
): SyntaxNode | null {
  let next = accessPath.nextSibling;
  while (next && ASSIGNMENT_PAIR_BRIDGE.has(next.name)) {
    next = next.nextSibling;
  }
  return next?.name === "LuauAssignmentOperation" ? next : null;
}

// Walks the function's `_content` top-level children and emits one
// diagnostic per child that isn't a legitimate Luau statement shape.
// Specifically handles:
//   - bare `LuauAccessPath` not followed by an assignment → likely
//     accidental display text (`Hello world`, `choose`, etc., which
//     the grammar reads as access paths inside a function body).
//   - `LuauDivertTargetLiteral` as a statement → likely an intended
//     divert (`-> target`).
//   - Any other unexpected shape → reported with the closest-fit
//     message (display text by default).
// Doesn't descend into legitimate statement shapes because their
// well-formed nested bodies (e.g. an `if ... end` block's branches) are
// validated separately when those rules are themselves lowered.
function collectProhibitedDiagnostics(
  root: SyntaxNode | null,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  if (!root) return diagnostics;
  let child = root.firstChild;
  let pendingAssignmentLhs: SyntaxNode | null = null;
  while (child) {
    // Skip an `LuauAccessPath` that's the LHS of an
    // implicit-assignment pair — `lowerStatements` will lower the
    // pair as one statement.
    if (
      child.name === "LuauAccessPath" &&
      findAssignmentOperationAfter(child)
    ) {
      pendingAssignmentLhs = child;
      child = child.nextSibling;
      continue;
    }
    if (
      pendingAssignmentLhs &&
      ASSIGNMENT_PAIR_BRIDGE.has(child.name)
    ) {
      child = child.nextSibling;
      continue;
    }
    if (
      pendingAssignmentLhs &&
      child.name === "LuauAssignmentOperation"
    ) {
      pendingAssignmentLhs = null;
      child = child.nextSibling;
      continue;
    }
    pendingAssignmentLhs = null;
    if (!LEGITIMATE_FUNCTION_BODY_CHILDREN.has(child.name)) {
      diagnostics.push({
        message: categorize(child.name),
        severity: ErrorType.Error,
        source: makeSource(child, ctx),
      });
    }
    child = child.nextSibling;
  }
  return diagnostics;
}

export function lowerLuauFunctionDefinition(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const declName = getDescendent("LuauFunctionDeclarationName", nodeRef.node);
  if (!declName) {
    // Anonymous function (no name after `function`) — skip at top level.
    return {};
  }
  const nameNode = getDescendent("LuauFunctionName", declName);
  if (!nameNode) return {};
  const identifier = new Identifier(ctx.read(nameNode.from, nameNode.to));

  const args = lowerArguments(nodeRef.node, ctx);

  const content = findChildByName(nodeRef.node, "LuauFunctionDefinition_content");
  const diagnostics = collectProhibitedDiagnostics(content, ctx);
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);

  const knot = new Knot(identifier, [], args, true);
  const rootWeave = new Weave(body);
  knot._rootWeave = rootWeave;
  knot.AddContent(rootWeave);

  const result: CompiledBlock = { content: [knot] };
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
}
