/**
 * print-lezer-tree <https://gist.github.com/msteen/e4828fbf25d6efef73576fc43ac479d2>
 *
 * Copyright (c) 2021 Matthijs Steen
 * Released under the MIT License.
 */

import { StringInput } from "../classes/StringInput";
import { SyntaxNode, Tree, TreeCursor, isErrorNode } from "../classes/Tree";
import { Input } from "../types/Input";
import { CursorNode, TreeTraversal, traverseTree } from "./traverseTree";

export function sliceType(
  cursor: TreeCursor,
  input: Input,
  type: number
): string | null {
  if (cursor.type === type) {
    const s = input.read(cursor.from, cursor.to);
    cursor.nextSibling();
    return s;
  }
  return null;
}

export function isType(cursor: TreeCursor, type: number): boolean {
  const cond = cursor.type === type;
  if (cond) {
    cursor.nextSibling();
  }
  return cond;
}

function isChildOf(child: CursorNode, parent: CursorNode | undefined): boolean {
  return Boolean(
    parent &&
      child.from >= parent.from &&
      child.from <= parent.to &&
      child.to <= parent.to &&
      child.to >= parent.from
  );
}

export function validatorTraversal(
  input: Input | string,
  { fullMatch = true }: { fullMatch?: boolean } = {}
) {
  if (typeof input === "string") {
    input = new StringInput(input);
  }
  const state = {
    valid: true,
    parentNodes: [] as CursorNode[],
    lastLeafTo: 0,
  };
  return {
    state,
    traversal: {
      onEnter(node) {
        state.valid = true;
        if (!node.isLeaf) {
          state.parentNodes.unshift(node);
        }
        if (node.from > node.to || node.from < state.lastLeafTo) {
          state.valid = false;
        } else if (node.isLeaf) {
          if (
            state.parentNodes.length &&
            !isChildOf(node, state.parentNodes[0])
          ) {
            state.valid = false;
          }
          state.lastLeafTo = node.to;
        } else {
          if (state.parentNodes.length) {
            if (!isChildOf(node, state.parentNodes[0])) {
              state.valid = false;
            }
          } else if (
            fullMatch &&
            (node.from !== 0 || node.to !== input.length)
          ) {
            state.valid = false;
          }
        }
      },
      onLeave(node) {
        if (!node.isLeaf) {
          state.parentNodes.shift();
        }
      },
    } as TreeTraversal,
  };
}

export function validateTree(
  tree: TreeCursor | Tree | SyntaxNode,
  input: Input | string,
  options?: { fullMatch?: boolean }
): boolean {
  const { state, traversal } = validatorTraversal(input, options);
  traverseTree(tree, traversal);
  return state.valid;
}

enum Color {
  Red = 31,
  Green = 32,
  Yellow = 33,
  Blue = 34,
  Magenta = 35,
  Cyan = 36,
}

function colorize(value: any, color: number): string {
  return "\u001b[" + color + "m" + String(value) + "\u001b[39m";
}

type PrintTreeOptions = {
  from?: number;
  to?: number;
  start?: number;
};

export function printTree(
  cursor: TreeCursor | Tree | SyntaxNode,
  input: Input | string,
  nodeNames: string[],
  { from, to, start = 0 }: PrintTreeOptions = {}
): string {
  const inp = typeof input === "string" ? new StringInput(input) : input;
  const state = {
    output: "",
    prefixes: [] as string[],
    hasNextSibling: false,
  };
  const validator = validatorTraversal(inp);
  traverseTree(cursor, {
    from,
    to,
    beforeEnter(cursor) {
      state.hasNextSibling = cursor.nextSibling() && cursor.prevSibling();
    },
    onEnter(node) {
      validator.traversal.onEnter(node);
      const isTop = state.output === "";
      const hasPrefix = !isTop || node.from > 0;
      if (hasPrefix) {
        state.output += (!isTop ? "\n" : "") + state.prefixes.join("");
        if (state.hasNextSibling) {
          state.output += " ├─ ";
          state.prefixes.push(" │  ");
        } else {
          state.output += " └─ ";
          state.prefixes.push("    ");
        }
      }
      const hasRange = node.from !== node.to;
      state.output +=
        (isErrorNode(node.type) || !validator.state.valid
          ? colorize(nodeNames[node.type], Color.Red)
          : isTop
          ? colorize(nodeNames[node.type], Color.Cyan)
          : nodeNames[node.type]) +
        " " +
        (hasRange
          ? "[" +
            colorize(start + node.from, Color.Yellow) +
            ".." +
            colorize(start + node.to, Color.Yellow) +
            "]"
          : colorize(start + node.from, Color.Yellow));
      if (hasRange && node.isLeaf) {
        state.output +=
          ": " +
          colorize(JSON.stringify(inp.read(node.from, node.to)), Color.Green);
      }
    },
    onLeave(node) {
      validator.traversal.onLeave!(node);
      state.prefixes.pop();
    },
  });
  return state.output;
}
