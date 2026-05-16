import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Stitch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";

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
  return { content: [stitch] };
}
