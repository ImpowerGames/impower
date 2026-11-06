import type { SyntaxNode, Tree } from "@lezer/common";

type Read = (from: number, to: number) => string;

const collect = (node: SyntaxNode, names: ReadonlySet<string>, found: SyntaxNode[] = []): SyntaxNode[] => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) {
      found.push(child);
    }
    if (child.name !== "FrontMatterString") {
      collect(child, names, found);
    }
  }
  return found;
};

const FIELD = new Set(["FrontMatterField"]);
const PARTS = new Set(["FrontMatterFieldKeyword", "FrontMatterString"]);

export const frontMatterFields = (tree: Tree, read: Read): Record<string, string[]> => {
  const fields: Record<string, string[]> = {};
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "FrontMatter") {
      continue;
    }
    for (const field of collect(node, FIELD)) {
      let keyword: string | undefined;
      const lines: string[] = [];
      for (const part of collect(field, PARTS)) {
        const text = read(part.from, part.to).trim();
        if (part.name === "FrontMatterFieldKeyword") {
          keyword ??= text;
        } else if (text) {
          lines.push(text);
        }
      }
      if (keyword) {
        fields[keyword] = lines;
      }
    }
  }
  return fields;
};
