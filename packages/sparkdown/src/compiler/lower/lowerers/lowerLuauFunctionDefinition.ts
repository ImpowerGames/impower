import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
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
// Function purity (no display text, no diverts in the body) is enforced
// by the grammar itself: a `LuauFunctionDefinition`'s body only includes
// Luau-statement patterns, so display lines and `-> divert` syntax can't
// land here. No lowerer-side validation is needed.

const FUNCTION_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauFunctionDeclarationName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
]);

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
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);

  const knot = new Knot(identifier, [], args, true);
  const rootWeave = new Weave(body);
  knot._rootWeave = rootWeave;
  knot.AddContent(rootWeave);

  return { content: [knot] };
}
