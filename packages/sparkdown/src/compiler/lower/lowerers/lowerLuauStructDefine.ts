import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { parseStructBodyTyped } from "./lowerStructBodyTyped";

// `animation NAME [as PARENT] with <body> end` / `theme NAME …` — structural
// presentation keywords (style-family, static, NOT reactive). Lower to a
// compile-time struct in program.context.<type>.<name>, like `style`, EXCEPT:
//   - the body is parsed by the TYPED reader (parseStructBodyTyped) so numeric
//     fields (offset/duration/iterations) stay numbers and quoted CSS stays a
//     string — matching what `define X as animation` used to produce.
//   - the struct implicitly `$extends` its type (PARENT ?? "<type>") so it
//     inherits the type's `$default` (the `define animation with …` /
//     `define theme with …` root in builtins.sd) via the existing inheritance
//     deep-merge — exactly as `define X as animation` did. See
//     project_animation_theme_structural.
export function lowerLuauStructDefine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  type: "animation" | "theme",
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
    `Luau${type === "animation" ? "Animation" : "Theme"}_content`,
  );
  const body = parseStructBodyTyped(contentNode, ctx);

  const struct: Record<string, unknown> = {
    $type: type,
    $name: name,
    // Inherit the type's $default (and any named parent's props) via the same
    // chain `define X as <type>` used. A block IS the type root only if it
    // names itself the type, which authors don't do — the builtin type roots
    // stay `define <type> with …`.
    $extends: parent || type,
    ...body,
  };

  return {
    content: [],
    context: { [type]: { [name]: struct } },
  };
}
