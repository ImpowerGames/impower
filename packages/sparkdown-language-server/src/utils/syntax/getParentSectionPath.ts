import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";

export const getParentSectionPath = <T extends string>(
  stack: GrammarSyntaxNode<T>[],
  read: (from: number, to: number) => string
): T[] => {
  let parentPathParts: { kind: "" | "knot" | "stitch"; name: string }[] = [];
  let topLevelNode = stack.at(-2)?.prevSibling;
  while (topLevelNode) {
    if (topLevelNode.name === "Knot") {
      const knotNameNode = getDescendent("KnotDeclarationName", topLevelNode);
      if (knotNameNode) {
        parentPathParts.unshift({
          kind: "knot",
          name: read(knotNameNode.from, knotNameNode.to),
        });
      }
      break;
    }
    if (topLevelNode.name === "Stitch") {
      const lastPart = parentPathParts.at(-1);
      if (lastPart?.kind !== "stitch") {
        const stitchNameNode = getDescendent(
          "StitchDeclarationName",
          topLevelNode
        );
        if (stitchNameNode) {
          parentPathParts.unshift({
            kind: "stitch",
            name: read(stitchNameNode.from, stitchNameNode.to),
          });
        }
      }
    }
    topLevelNode = topLevelNode.prevSibling;
  }
  parentPathParts.unshift({ kind: "", name: "" });
  return parentPathParts.map((p) => p.name as T);
};
