import {
  type Tree,
  type NodeIterator,
} from "../../../../grammar-compiler/src/compiler/classes/Tree";
import { type SparkdownSyntaxNode } from "../../types/SparkdownSyntaxNode";

export const getStack = (tree: Tree, offset: number): SparkdownSyntaxNode[] => {
  const side = -1;
  const stackIterator = tree.resolveStack(offset, side);
  const stack = [] as SparkdownSyntaxNode[];
  for (let cur: NodeIterator | null = stackIterator; cur; cur = cur.next) {
    stack.push(cur.node as SparkdownSyntaxNode);
  }
  return stack;
};
