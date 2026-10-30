import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { nodeNameSet } from "@impower/sparkdown/src/compiler/utils/nodeNameSet";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendentInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendentInsideParent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { getNodesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getNodesInsideParent";
import { getOtherNodesInsideParent } from "@impower/textmate-grammar-tree/src/tree/utils/getOtherNodesInsideParent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type SyntaxNode, type Tree } from "@lezer/common";

declare const tree: Tree;
declare const plain: SyntaxNode;
const stack = getStack<SparkdownNodeName>(tree, 0);
const typed = stack[0] as GrammarSyntaxNode<SparkdownNodeName>;

// @ts-expect-error a name the grammar cannot produce, typed parent
getDescendent("NotARule_1", typed);
// @ts-expect-error a name the grammar cannot produce, in an array
getDescendents(["Divert", "NotARule_2"], typed);
// @ts-expect-error a name the grammar cannot produce, typed stack
getDescendentInsideParent("NotARule_3", "Divert", stack);
// @ts-expect-error a stale parent name is rejected too
getDescendentInsideParent("Divert_content", "NotARule_4", stack);
// @ts-expect-error a name the grammar cannot produce, typed stack
getNodesInsideParent("NotARule_5", "FrontMatter", stack);
// @ts-expect-error a name the grammar cannot produce, typed stack
getOtherNodesInsideParent("NotARule_6", "FrontMatter", stack);
// @ts-expect-error a direct comparison on a typed node
if (typed.name === "NotARule_7") {
  void 0;
}
// @ts-expect-error a constant set built with the helper
const badSet = nodeNameSet(["NotARule_8"]);
void badSet;

const found = getDescendent("FrontMatterField", typed);
if (found) {
  // @ts-expect-error still rejected through a narrowed node
  getDescendent("NotARule_9", found);
  const inner = getDescendent("FrontMatterFieldKeyword", found);
  void inner;
  const narrowed: "FrontMatterField" = found.name;
  void narrowed;
}

getDescendent("Divert_content", typed);
getDescendents(["Divert", "DivertPath"], typed);
getDescendentInsideParent("Divert_content", "Divert", stack);
getDescendentInsideParent(["Divert_content"], ["Divert", "FrontMatter"], stack);
const goodSet = nodeNameSet(["Scene", "Branch"]);
void goodSet;
const plainName: string = plain.name;
void goodSet.has(plainName);

getDescendent("NotARule_10", plain);

export {};
