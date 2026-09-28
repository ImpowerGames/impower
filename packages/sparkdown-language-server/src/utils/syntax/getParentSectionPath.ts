import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";

/**
 * The scope path of the cursor position: the names of the enclosing scene and
 * branch, outermost first. This mirrors the scope keys that
 * `getDeclarationScopes` builds, which nest only scenes and branches;
 * functions and stored variables are global there, and a Luau local or
 * function parameter is scoped to its block, so a function definition does not
 * contribute a path part here either.
 *
 * `Scene` and `Branch` are boundary-only nodes: each covers its declaration
 * line and its body follows as root-level siblings, closed by a root-level
 * `end`. So the walk starts at the root-level ancestor of the cursor and moves
 * backwards through its siblings, pairing each `end` with the scene or branch
 * it closes, collecting the nearest open branch and stopping at the first open
 * scene. A scene also closes everything before it and a branch every branch
 * before it, as they do in `getDeclarationScopes`, so a scene or branch left
 * without its `end` is not reopened once a later one has been passed.
 *
 * The compiler's `isInsideScene` (`validateSceneBranchScope.ts` in
 * `@impower/sparkdown`) walks the same siblings to decide whether a branch sits
 * inside a scene. It only has to reject a misplaced branch, and a script
 * missing an `end` already has an error there, so on such a script the two can
 * answer differently; this walk's rule is the one completion and the outline
 * share.
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
  // Ends passed on the way back whose scene or branch is not reached yet.
  let unmatchedEnds = 0;
  // Whether a branch has been passed; any earlier branch is closed by it.
  let passedBranch = false;
  while (topLevelNode) {
    if (topLevelNode.name === "LuauEndKeyword") {
      unmatchedEnds += 1;
    } else if (topLevelNode.name === "Scene" && unmatchedEnds > 0) {
      // A closed scene: the cursor is after it, and it closed everything
      // before it.
      break;
    } else if (topLevelNode.name === "Branch" && unmatchedEnds > 0) {
      unmatchedEnds -= 1;
      passedBranch = true;
    } else if (topLevelNode.name === "Branch" && passedBranch) {
      // Left without its `end`, and closed by the branch after it.
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
