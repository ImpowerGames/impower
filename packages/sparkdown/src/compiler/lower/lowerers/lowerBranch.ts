import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Stitch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";
import { validateBranch } from "../utils/validateSceneBranchScope";

// `Branch` is a boundary-only Scoped rule (see docs/compiler/GRAMMAR.md). The
// body lives at root; the lowerer validates that the branch sits
// inside an active scene AND has a matching `end` keyword later.
export function lowerBranch(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("BranchDeclarationName", nodeRef.node);
  if (!nameNode) {
    return {};
  }
  const identifier = new Identifier(ctx.read(nameNode.from, nameNode.to));
  const args = lowerArguments(nodeRef.node, ctx);
  const stitch = new Stitch(identifier, [], args, false);
  const diagnostics = validateBranch(nodeRef.node, ctx);
  const block: CompiledBlock = { content: [stitch] };
  if (diagnostics.length > 0) block.diagnostics = diagnostics;
  return block;
}
