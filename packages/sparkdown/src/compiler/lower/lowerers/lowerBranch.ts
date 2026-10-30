import { identifierAt } from "../utils/debugMetadata";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Stitch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";
import { markRootParameters } from "../utils/rootLocalReads";

export function lowerBranch(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("BranchDeclarationName", nodeRef.node);
  if (!nameNode) {
    return {};
  }
  const identifier = identifierAt(nameNode, ctx);
  const args = lowerArguments(nodeRef.node, ctx);
  markRootParameters(nodeRef.node, args, ctx);
  const stitch = new Stitch(identifier, [], args, false);
  return { content: [stitch] };
}
