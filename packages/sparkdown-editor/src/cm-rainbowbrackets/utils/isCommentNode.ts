import type { SyntaxNode } from "@lezer/common";
import { tags } from "@lezer/highlight";
import { getAllStyleTags } from "./getAllStyleTags";

export const isCommentNode = (node: SyntaxNode) =>
  getAllStyleTags(node)?.tags?.some(
    (t) =>
      t === tags.comment ||
      t === tags.lineComment ||
      t === tags.blockComment ||
      t === tags.docComment
  );
