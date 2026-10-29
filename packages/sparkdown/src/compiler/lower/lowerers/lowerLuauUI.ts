import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";
import { parseStructBody } from "./lowerStructBody";
import { readStructBodyEntries } from "../utils/structBodyEntries";
import { buildSparkleBody } from "./lowerSparkleBody";
import { validateSparkleBlocks } from "../utils/validateSparkleBlocks";
import { validateBlockStructure } from "../utils/validateBlockStructure";
import {
  type ComponentNode,
  type LayoutNode,
  type ScreenNode,
} from "../../types/SparkleNode";

function collectFunctionParameterNames(
  node: SparkdownSyntaxNodeRef["node"],
  ctx: LowerContext,
): string[] {
  const names: string[] = [];
  const walk = (n: SyntaxNode) => {
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
  ctx.diagnostics?.push(...validateBlockStructure(nodeRef.node, ctx, uiType));
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);
  if (!nameNode) return { content: [] };
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return { content: [] };

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parent = parentNode
    ? ctx.read(parentNode.from, parentNode.to).trim()
    : "";

  const screenNode =
    uiType === "layout"
      ? getDescendent("LuauLayoutScreenName", nodeRef.node)
      : undefined;
  const screen = screenNode
    ? ctx.read(screenNode.from, screenNode.to).trim()
    : "";

  const params =
    uiType === "component" ? collectFunctionParameterNames(nodeRef.node, ctx) : [];

  const contentNode = findChildByName(
    nodeRef.node,
    `Luau${uiType === "layout" ? "Layout" : "Component"}_content`,
  );
  const body = parseStructBody(readStructBodyEntries(contentNode, ctx), ctx, {
    elementKeys: true,
  });

  const struct: Record<string, unknown> = {
    $type: uiType,
    $name: name,
    $recursive: true,
    ...(parent ? { $extends: parent } : {}),
    ...(screen ? { $screen: screen } : {}),
    ...body,
  };

  const savedLoopVars = ctx.sparkleLoopVars;
  const savedOwner = ctx.sparkleOwner;
  if (params.length > 0) {
    ctx.sparkleLoopVars = [...(savedLoopVars ?? []), ...params];
  }
  ctx.sparkleOwner = `${uiType}_${name}`;
  const children = buildSparkleBody(contentNode, ctx);
  ctx.sparkleLoopVars = savedLoopVars;
  ctx.sparkleOwner = savedOwner;
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

  const structure = validateSparkleBlocks(contentNode, ctx);

  return {
    content: [],
    context: { [uiType]: { [name]: struct } },
    sparkle,
    ...(structure.length > 0 ? { diagnostics: structure } : {}),
  };
}

export function lowerLuauScreen(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  ctx.diagnostics?.push(...validateBlockStructure(nodeRef.node, ctx, "screen"));
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
