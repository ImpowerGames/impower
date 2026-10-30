import { identifierAt } from "../utils/debugMetadata";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerLabelAnchor(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("LabelDeclarationName", nodeRef.node);
  if (!nameNode) return {};
  const identifier = identifierAt(nameNode, ctx);
  const gather = new Gather(identifier, 0);
  return wrapInWeave([gather]);
}
