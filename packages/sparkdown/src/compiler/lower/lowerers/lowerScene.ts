import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";
import { validateScene } from "../utils/validateSceneBranchScope";

// `Scene` is a boundary-only Scoped rule (see docs/compiler/GRAMMAR.md) — it
// covers the declaration line only. The scene's body lives at root,
// so this lowerer just builds the Knot from the declaration and
// validates that a matching `end` keyword appears later at root
// level (the lowerer pairs declarations with their `LuauEndKeyword`
// siblings — see `validateSceneBranchScope`).
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
  const diagnostics = validateScene(nodeRef.node, ctx);
  const block: CompiledBlock = { content: [knot] };
  if (diagnostics.length > 0) block.diagnostics = diagnostics;
  return block;
}
