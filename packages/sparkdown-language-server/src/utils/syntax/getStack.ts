import type {
  TextDocument,
  Position,
} from "vscode-languageserver-textdocument";
import type {
  Tree,
  NodeIterator,
} from "../../../../grammar-compiler/src/compiler/classes/Tree";
import type { SparkdownSyntaxNode } from "../../types/SparkdownSyntaxNode";

export const getStack = (
  tree: Tree,
  document: TextDocument,
  position: Position
): SparkdownSyntaxNode[] => {
  const side = -1;
  const pos = document.offsetAt(position);
  const stackIterator = tree.resolveStack(pos, side);
  const stack = [] as SparkdownSyntaxNode[];
  for (let cur: NodeIterator | null = stackIterator; cur; cur = cur.next) {
    stack.push(cur.node as SparkdownSyntaxNode);
  }
  return stack;
};
