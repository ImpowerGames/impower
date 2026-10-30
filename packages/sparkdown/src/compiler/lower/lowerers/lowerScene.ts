import { identifierAt } from "../utils/debugMetadata";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";
import { markRootParameters } from "../utils/rootLocalReads";

export function lowerScene(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("SceneDeclarationName", nodeRef.node);
  if (!nameNode) {
    return {};
  }
  const identifier = identifierAt(nameNode, ctx);
  const args = lowerArguments(nodeRef.node, ctx);
  markRootParameters(nodeRef.node, args, ctx);
  const knot = new Knot(identifier, [], args, false);
  return { content: [knot] };
}
