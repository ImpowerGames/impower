import type { SyntaxNode } from "@lezer/common";

export const readSkipping = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
  skipped: (descendant: SyntaxNode) => boolean,
): string => {
  let text = "";
  let pos = node.from;
  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (skipped(child)) {
        text += read(pos, child.from);
        pos = child.to;
      } else {
        visit(child);
      }
    }
  };
  visit(node);
  return text + read(pos, node.to);
};
