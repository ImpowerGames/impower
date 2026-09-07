import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";

/**
 * The scope path of the cursor position: the names of the enclosing scene and
 * branch, outermost first. This mirrors the scope keys that
 * `getDeclarationScopes` builds, which nest only scenes and branches;
 * functions, consts and vars are global there, so a function definition does
 * not contribute a path part here either.
 *
 * `Scene` and `Branch` are boundary-only nodes: each covers its declaration
 * line and its body follows as root-level siblings. So the walk starts at the
 * root-level ancestor of the cursor and moves backwards through its siblings,
 * collecting the nearest branch and stopping at the first scene.
 */
export const getParentSectionPath = (
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  read: (from: number, to: number) => string,
): string[] => {
  let parentPathParts: {
    kind: "scene" | "branch";
    name: string;
  }[] = [];
  // A lezer sibling is a plain `SyntaxNode`; it belongs to the same tree, so
  // typing it with the grammar's names keeps the lookups below checked.
  let topLevelNode = stack.at(-2)?.prevSibling as
    | GrammarSyntaxNode<SparkdownNodeName>
    | null
    | undefined;
  while (topLevelNode) {
    if (topLevelNode.name === "Scene") {
      const sceneNameNode = getDescendent("SceneDeclarationName", topLevelNode);
      if (sceneNameNode) {
        parentPathParts.unshift({
          kind: "scene",
          name: read(sceneNameNode.from, sceneNameNode.to),
        });
      }
      break;
    }
    if (topLevelNode.name === "Branch") {
      const lastPart = parentPathParts.at(-1);
      if (lastPart?.kind !== "branch") {
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
    }
    topLevelNode = topLevelNode.prevSibling as
      | GrammarSyntaxNode<SparkdownNodeName>
      | null;
  }
  return parentPathParts.map((p) => p.name);
};
