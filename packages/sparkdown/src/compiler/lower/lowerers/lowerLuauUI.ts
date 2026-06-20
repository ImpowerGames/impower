import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { collectStructBodyLines, parseStructBody } from "./lowerStructBody";
import { buildSparkleBody } from "./lowerSparkleBody";
import {
  type ComponentNode,
  type LayoutNode,
  type ScreenNode,
} from "../../types/SparkleNode";

// `layout NAME [as PARENT] [in SCREEN] with <colon/indent element tree> end`
// (and `component`). Structural UI keywords; lower to a COMPILE-TIME struct in
// program.context.layout|component.<name> via the chunk's `context`. The
// body is the colon/indent named-element tree the engine consumes
// directly (`stage:` → `backdrop:` → `image = "black"` / bare markers),
// parsed by the shared lowerStructBody.
/** Collect the `LuauFunctionParameter` names declared in a component header
 *  (`component card(title, value)` → ["title", "value"]), in source order. */
function collectFunctionParameterNames(
  node: SparkdownSyntaxNodeRef["node"],
  ctx: LowerContext,
): string[] {
  const names: string[] = [];
  const walk = (n: typeof node) => {
    let c = n.firstChild;
    while (c) {
      if (c.name === "LuauFunctionParameter") {
        const text = ctx.read(c.from, c.to).trim();
        if (text) names.push(text);
      } else {
        walk(c);
      }
      c = c.nextSibling;
    }
  };
  walk(node);
  return names;
}

export function lowerLuauUI(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
  uiType: "layout" | "component",
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  // `layout NAME in SCREEN` — the navigation screen the layout belongs to
  // (layout-only). The grammar restricts the `in SCREEN` clause to the layout
  // header, so this node never appears for components.
  const screenNode =
    uiType === "layout"
      ? getDescendent("LuauLayoutScreenName", nodeRef.node)
      : undefined;
  const screen = screenNode
    ? ctx.read(screenNode.from, screenNode.to).trim()
    : "";

  // Component parameters (`component card(title, …)`): the header's
  // LuauFunctionParameter names (spec §4.7). Read into ComponentNode.params AND
  // pushed onto ctx.sparkleLoopVars while the body is lowered, so a `{title}`
  // binding in the body compiles to `__binding_N(title) return title end` — the
  // runtime passes each call-arg value as the matching arg (same mechanism as
  // `for`-loop vars; see LowerContext.sparkleLoopVars / lowerBinding).
  const params =
    uiType === "component" ? collectFunctionParameterNames(nodeRef.node, ctx) : [];

  const contentNode = findChildByName(
    nodeRef.node,
    `Luau${uiType === "layout" ? "Layout" : "Component"}_content`,
  );
  const body = parseStructBody(collectStructBodyLines(contentNode, ctx));

  const struct: Record<string, unknown> = {
    $type: uiType,
    $name: name,
    $recursive: true,
    ...(parent ? { $extends: parent } : {}),
    ...(screen ? { $screen: screen } : {}),
    ...body,
  };

  // Reactive Sparkle UI AST (additive, not yet consumed by the engine — the
  // static `context` struct above still drives rendering). Built by reading
  // the grammar's already-separated element tokens, never re-parsing raw text.
  const savedLoopVars = ctx.sparkleLoopVars;
  if (params.length > 0) {
    ctx.sparkleLoopVars = [...(savedLoopVars ?? []), ...params];
  }
  const children = buildSparkleBody(contentNode, ctx);
  ctx.sparkleLoopVars = savedLoopVars;
  const sparkle =
    uiType === "layout"
      ? {
          layouts: {
            [name]: {
              kind: "layout",
              name,
              ...(parent ? { extends: parent } : {}),
              ...(screen ? { screen } : {}),
              children,
            } satisfies LayoutNode,
          },
        }
      : {
          components: {
            [name]: {
              kind: "component",
              name,
              ...(parent ? { extends: parent } : {}),
              params,
              children,
            } satisfies ComponentNode,
          },
        };

  return {
    content: [],
    context: { [uiType]: { [name]: struct } },
    sparkle,
  };
}

// `screen NAME with … end` — a navigation SCREEN: the named group that holds
// mutually-exclusive layouts (`layout X in NAME`). Lowers to a compile-time
// `screen` struct in program.context.screen.<name> so `in SCREEN` references and
// `[[navigate SCREEN to LAYOUT]]` validate against it (undefined screen =
// error). The body is reserved for future screen-level config; ignored for now.
export function lowerLuauScreen(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const struct: Record<string, unknown> = {
    $type: "screen",
    $name: name,
  };

  return {
    content: [],
    context: { screen: { [name]: struct } },
    sparkle: {
      screens: { [name]: { kind: "screen", name } satisfies ScreenNode },
    },
  };
}
