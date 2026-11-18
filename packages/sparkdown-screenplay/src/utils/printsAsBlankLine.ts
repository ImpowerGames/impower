import type { NodeType, SyntaxNodeRef, Tree } from "@lezer/common";

const SCREENPLAY_ELEMENT_NODES: ReadonlySet<string> = new Set([
  "FrontMatter",
  "Scene",
  "Branch",
  "BlockTitle",
  "InlineTitle",
  "BlockHeading",
  "InlineHeading",
  "BlockTransitional",
  "InlineTransitional",
  "BlockWrite",
  "InlineWrite",
  "BlockDialogue",
  "InlineDialogue",
  "BlockAction",
  "InlineAction",
  "ImplicitAction",
  "Choice",
  "Newline",
  "Whitespace",
]);

const ROOT = "sparkdown";

export const printsAsBlankLine = (
  name: string,
  parentName: string | undefined,
): boolean =>
  parentName === ROOT && !SCREENPLAY_ELEMENT_NODES.has(name);

const topLevelTest =(tree: Tree): ((node: SyntaxNodeRef) => boolean) => {
  const tops = new Map<number, { to: number; type: NodeType }[]>();
  const cursor = tree.cursor();
  if (cursor.name === ROOT && cursor.firstChild()) {
    do {
      const top = { to: cursor.to, type: cursor.type };
      const at = tops.get(cursor.from);
      if (at) at.push(top);
      else tops.set(cursor.from, [top]);
    } while (cursor.nextSibling());
  }
  return (node) => {
    const at = tops.get(node.from);
    if (!at) return false;
    for (const top of at) {
      if (top.to === node.to && top.type === node.type) return true;
    }
    return false;
  };
};

export const blankLineTest = (tree: Tree): ((node: SyntaxNodeRef) => boolean) => {
  const isTopLevel = topLevelTest(tree);
  return (node) => !SCREENPLAY_ELEMENT_NODES.has(node.name) && isTopLevel(node);
};
