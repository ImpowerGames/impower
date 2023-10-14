/**
 * print-lezer-tree <https://gist.github.com/msteen/e4828fbf25d6efef73576fc43ac479d2>
 *
 * Copyright (c) 2021 Matthijs Steen
 * Released under the MIT License.
 */

import {
  NodeType,
  SyntaxNode,
  Tree,
  TreeCursor,
  isAnonymousNode,
} from "../classes/Tree";

export type CursorNode = {
  type: NodeType;
  from: number;
  to: number;
  isLeaf: boolean;
};

export function cursorNode(
  { type, from, to }: TreeCursor,
  isLeaf = false
): CursorNode {
  return { type, from, to, isLeaf };
}

export type TreeTraversal = {
  beforeEnter?: (cursor: TreeCursor) => void;
  onEnter: (node: CursorNode) => false | void;
  onLeave?: (node: CursorNode) => false | void;
};

type TreeTraversalOptions = {
  from?: number;
  to?: number;
} & TreeTraversal;

export function traverseTree(
  cursor: TreeCursor | Tree | SyntaxNode,
  {
    from = -Infinity,
    to = Infinity,
    beforeEnter,
    onEnter,
    onLeave,
  }: TreeTraversalOptions
): void {
  if (!(cursor instanceof TreeCursor)) {
    cursor = cursor.cursor();
  }
  for (;;) {
    let node = cursorNode(cursor);
    let leave = false;
    if (node.from <= to && node.to >= from) {
      const enter = !isAnonymousNode(node.type);
      if (enter && beforeEnter) {
        beforeEnter(cursor);
      }
      node.isLeaf = !cursor.firstChild();
      if (enter) {
        leave = true;
        if (onEnter(node) === false) {
          return;
        }
      }
      if (!node.isLeaf) {
        continue;
      }
    }
    for (;;) {
      node = cursorNode(cursor, node.isLeaf);
      if (leave && onLeave) {
        if (onLeave(node) === false) {
          return;
        }
      }
      leave = isAnonymousNode(cursor.type);
      node.isLeaf = false;
      if (cursor.nextSibling()) {
        break;
      }
      if (!cursor.parent()) {
        return;
      }
      leave = true;
    }
  }
}
