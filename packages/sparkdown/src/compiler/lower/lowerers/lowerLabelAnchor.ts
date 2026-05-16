import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

// Lowers a `label NAME` line — a non-weave named divert target.
// Replaces the legacy `- (label)` syntax. Subsequent sibling lines
// (on the same or following indented lines) get attached as the
// label's body by inkjs's Weave assembly, same as the old form.
//
// Reuses the inkjs `Gather` ParsedHierarchy class at depth 0 since
// the runtime shape (named container that can be diverted to) is
// identical — only the surface syntax changed.
export function lowerLabelAnchor(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("LabelDeclarationName", nodeRef.node);
  if (!nameNode) return {};
  const identifier = new Identifier(ctx.read(nameNode.from, nameNode.to));
  const gather = new Gather(identifier, 0);
  return wrapInWeave([gather]);
}
