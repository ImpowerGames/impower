import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { collectStructBodyLines, parseStructBody } from "./lowerStructBody";

// `screen NAME [as PARENT] with <colon/indent element tree> end` (and
// `component`). Structural UI keywords; lower to a COMPILE-TIME struct in
// program.context.screen|component.<name> via the chunk's `context`. The
// body is the colon/indent named-element tree the engine consumes
// directly (`stage:` → `backdrop:` → `image = "black"` / bare markers),
// parsed by the shared lowerStructBody.
export function lowerLuauUI(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  uiType: "screen" | "component",
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const contentNode = findChildByName(
    nodeRef.node,
    `Luau${uiType === "screen" ? "Screen" : "Component"}_content`,
  );
  const body = parseStructBody(collectStructBodyLines(contentNode, ctx));

  const struct: Record<string, unknown> = {
    $type: uiType,
    $name: name,
    $recursive: true,
    ...(parent ? { $extends: parent } : {}),
    ...body,
  };

  return {
    content: [],
    context: { [uiType]: { [name]: struct } },
  };
}
