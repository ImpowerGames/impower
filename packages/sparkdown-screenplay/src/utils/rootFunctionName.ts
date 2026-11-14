import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "../../../textmate-grammar-tree/src/tree/utils/getDescendent";

const ROOT_FUNCTION_WRAPPERS = new Set([
  "LuauFunctionAttributes",
  "LuauFunctionAttributes_content",
  "LuauSparkdownExplicitStatement",
  "LuauSparkdownExplicitStatement_content",
]);

export const isRootFunctionName = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean => {
  const definition = node.parent?.parent;
  let container = definition?.parent;
  while (container && ROOT_FUNCTION_WRAPPERS.has(container.name)) {
    container = container.parent;
  }
  if (
    node.name !== "LuauFunctionDeclarationName" ||
    node.parent?.name !== "LuauFunctionDefinition_content" ||
    definition?.name !== "LuauFunctionDefinition" ||
    container?.name !== "sparkdown"
  ) {
    return false;
  }
  const begin = definition.getChild("LuauFunctionDefinition_begin");
  const modifier = begin && getDescendent("LuauScopeModifier", begin);
  return !modifier || read(modifier.from, modifier.to) !== "local";
};

export const rootFunctionName = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): string => {
  const cursor = node.cursor();
  while (cursor.next() && cursor.from < node.to) {
    if (isRootFunctionName(cursor.node, read)) {
      return read(cursor.from, cursor.to);
    }
  }
  return "";
};
