import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";

export const getParentSectionPath = (
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  read: (from: number, to: number) => string,
): string[] => {
  let parentPathParts: {
    kind: "scene" | "branch";
    name: string;
  }[] = [];
  let topLevelNode = stack.at(-2)?.prevSibling as
    | GrammarSyntaxNode<SparkdownNodeName>
    | null
    | undefined;
  let unmatchedEnds = 0;
  let passedBranch = false;
  while (topLevelNode) {
    if (topLevelNode.name === "LuauEndKeyword") {
      unmatchedEnds += 1;
    } else if (topLevelNode.name === "Scene" && unmatchedEnds > 0) {
      break;
    } else if (topLevelNode.name === "Branch" && unmatchedEnds > 0) {
      unmatchedEnds -= 1;
      passedBranch = true;
    } else if (topLevelNode.name === "Branch" && passedBranch) {
    } else if (topLevelNode.name === "Scene") {
      const sceneNameNode = getDescendent("SceneDeclarationName", topLevelNode);
      if (sceneNameNode) {
        parentPathParts.unshift({
          kind: "scene",
          name: read(sceneNameNode.from, sceneNameNode.to),
        });
      }
      break;
    } else if (topLevelNode.name === "Branch") {
      passedBranch = true;
      const branchNameNode = getDescendent(
        "BranchDeclarationName",
        topLevelNode,
      );
      if (branchNameNode) {
        parentPathParts.unshift({
          kind: "branch",
          name: read(branchNameNode.from, branchNameNode.to),
        });
      }
    }
    topLevelNode = topLevelNode.prevSibling as
      | GrammarSyntaxNode<SparkdownNodeName>
      | null;
  }
  return parentPathParts.map((p) => p.name);
};
