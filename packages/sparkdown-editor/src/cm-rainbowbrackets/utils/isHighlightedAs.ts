import type { SyntaxNode } from "@lezer/common";
import { Tag } from "@lezer/highlight";
import { getAllStyleTags } from "./getAllStyleTags";

export const isHighlightedAs = (node: SyntaxNode, ...tags: Tag[]) =>
  getAllStyleTags(node)?.tags?.some((t) => tags.includes(t));
