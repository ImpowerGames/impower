import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Stitch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";

// `Branch` is a boundary-only Scoped rule (see docs/compiler/GRAMMAR.md). The
// body lives at root. The inside-a-scene / matching-`end` checks depend on
// other root-level siblings, so they run as a fresh whole-document pass each
// compile (see `SparkdownCompiler.validateSceneStructure`), not here — per-chunk
// lowering would go stale when only a sibling `end`/scene is edited.
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
