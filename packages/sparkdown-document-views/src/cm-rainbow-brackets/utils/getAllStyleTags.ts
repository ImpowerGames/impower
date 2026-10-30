import type { SyntaxNode } from "@lezer/common";
import { Tag, getStyleTags } from "@lezer/highlight";

export const getAllStyleTags = (
  node: SyntaxNode,
): {
  tags: readonly Tag[];
  opaque: boolean;
  inherit: boolean;
} | null => {
  if (!node) {
    return null;
  }
  const tags = getStyleTags(node);
  if (tags) {
    return tags;
  }
  if (!node.parent) {
    return null;
  }
  return getAllStyleTags(node.parent);
};
