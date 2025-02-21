import { type SyntaxNode } from "../../../../grammar-compiler/src/compiler/classes/Tree";
import { getDescendent } from "./getDescendent";

export const getParentSectionPath = (
  stack: SyntaxNode[],
  read: (from: number, to: number) => string
) => {
  let parentPathParts: { kind: "" | "knot" | "stitch"; name: string }[] = [];
  let topLevelNode = stack.at(-2)?.prevSibling;
  while (topLevelNode) {
    if (topLevelNode.type.name === "Knot") {
      const knotNameNode = getDescendent("KnotDeclarationName", topLevelNode);
      if (knotNameNode) {
        parentPathParts.unshift({
          kind: "knot",
          name: read(knotNameNode.from, knotNameNode.to),
        });
      }
      break;
    }
    if (topLevelNode.type.name === "Stitch") {
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
  return parentPathParts.map((p) => p.name).join(".");
};
