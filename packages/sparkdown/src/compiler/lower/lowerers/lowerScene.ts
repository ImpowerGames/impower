import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";

export function lowerScene(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("SceneDeclarationName", nodeRef.node);
  if (!nameNode) {
    return {};
  }
  const identifier = new Identifier(ctx.read(nameNode.from, nameNode.to));
  const args = lowerArguments(nodeRef.node, ctx);
  const knot = new Knot(identifier, [], args, false);
  return { content: [knot] };
}
