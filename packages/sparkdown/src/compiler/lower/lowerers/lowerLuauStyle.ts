import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { parseStructBody } from "./lowerStructBody";
import { readStructBodyEntries } from "../utils/structBodyEntries";
import { validateBlockStructure } from "../utils/validateBlockStructure";

export function lowerLuauStyle(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  ctx.diagnostics?.push(...validateBlockStructure(nodeRef.node, ctx, "style"));
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const contentNode = findChildByName(nodeRef.node, "LuauStyle_content");
  const body = parseStructBody(readStructBodyEntries(contentNode, ctx), ctx);

  const struct: Record<string, unknown> = {
    $type: "style",
    $name: name,
    ...(parent ? { $extends: parent } : {}),
    ...body,
  };

  return {
    content: [],
    context: { style: { [name]: struct } },
  };
}
