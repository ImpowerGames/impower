import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { collectStructBodyLines, parseStructBody } from "./lowerStructBody";

// `style NAME [as PARENT] with <colon/indent body> end` — a structural UI
// keyword. Lowers to a COMPILE-TIME `style` struct in
// program.context.style.<name> (no runtime objects), via the chunk's
// `context`. The body keeps the colon/indent struct form (props, nested
// `key:` blocks, `> selector:` rules, `@breakpoint:` directives) — parsed
// by the shared lowerStructBody. See project memory project_ui_syntax_design.
export function lowerLuauStyle(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const contentNode = findChildByName(nodeRef.node, "LuauStyle_content");
  const body = parseStructBody(collectStructBodyLines(contentNode, ctx));

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
