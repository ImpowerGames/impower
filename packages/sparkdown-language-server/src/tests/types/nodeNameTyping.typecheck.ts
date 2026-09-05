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

// Compile-time pins for the node-name typing. Nothing here runs: vitest does
// not pick the file up (it is not a `.test.ts`), and `tsc` checks it as part of
// this package. Each `@ts-expect-error` line asserts that a name the grammar
// cannot produce is rejected; if a refactor of the tree helpers or of
// `GrammarSyntaxNode` ever stops rejecting it, the directive itself becomes
// the error and the typecheck gate fails. The lines without a directive
// assert that the shapes the codebase relies on still compile.

declare const tree: Tree;
declare const plain: SyntaxNode;
const stack = getStack<SparkdownNodeName>(tree, 0);
const typed = stack[0] as GrammarSyntaxNode<SparkdownNodeName>;

// A stale name is rejected wherever the parent or the stack is typed.

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

// The result of one lookup is a valid parent for the next: the grammar's set
// travels on `type.name` while `name` narrows to what was looked up.
const found = getDescendent("FrontMatterField", typed);
if (found) {
  // @ts-expect-error still rejected through a narrowed node
  getDescendent("NotARule_9", found);
  const inner = getDescendent("FrontMatterFieldKeyword", found);
  void inner;
  const narrowed: "FrontMatterField" = found.name;
  void narrowed;
}

// Valid names compile in every shape the codebase uses.
getDescendent("Divert_content", typed);
getDescendents(["Divert", "DivertPath"], typed);
getDescendentInsideParent("Divert_content", "Divert", stack);
getDescendentInsideParent(["Divert_content"], ["Divert", "FrontMatter"], stack);
const goodSet = nodeNameSet(["Scene", "Branch"]);
void goodSet;
const plainName: string = plain.name;
void goodSet.has(plainName);

// A bare lezer node infers `string` and checks nothing; that shape is what
// scripts/check-node-names.mjs covers.
getDescendent("NotARule_10", plain);

export {};
