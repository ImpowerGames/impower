import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerArguments } from "../utils/lowerArguments";

// `Scene` is a boundary-only Scoped rule (see docs/compiler/GRAMMAR.md) — it
// covers the declaration line only. The scene's body lives at root,
// so this lowerer just builds the Knot from the declaration. The
// scene/`end` pairing check is NOT done here: it depends on LATER
// root-level siblings (the matching `end`), so per-chunk lowering would
// go stale when only the `end` chunk is edited. It runs as a fresh
// whole-document pass each compile — see `SparkdownCompiler.validateSceneStructure`.
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
