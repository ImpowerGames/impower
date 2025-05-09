/**
 * print-lezer-tree <https://gist.github.com/msteen/e4828fbf25d6efef73576fc43ac479d2>
 *
 * Copyright (c) 2021 Matthijs Steen
 * Released under the MIT License.
 */

import {
  type SyntaxNode,
  type Tree,
  type TreeCursor,
  type NodeType,
  type Input,
} from "@lezer/common";

class StringInput implements Input {
  constructor(private readonly input: string) {}

  get length() {
    return this.input.length;
  }

  chunk(from: number): string {
    return this.input.slice(from);
  }

  lineChunks = false;

  read(from: number, to: number): string {
    return this.input.slice(from, to);
  }
}

export function sliceType(
  cursor: TreeCursor,
  input: Input,
  type: number
): string | null {
  if (cursor.type.id === type) {
    const s = input.read(cursor.from, cursor.to);
    cursor.nextSibling();
    return s;
  }
  return null;
}

export function isType(cursor: TreeCursor, type: number): boolean {
  const cond = cursor.type.id === type;
  if (cond) {
    cursor.nextSibling();
  }
  return cond;
}

export type CursorNode = {
  type: NodeType;
  from: number;
  to: number;
  isLeaf: boolean;
};

function cursorNode(
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
  includeParents?: boolean;
} & TreeTraversal;

export function traverseTree(
  cursor: TreeCursor | Tree | SyntaxNode,
  {
    from = -Infinity,
    to = Infinity,
    includeParents = false,
    beforeEnter,
    onEnter,
    onLeave,
  }: TreeTraversalOptions
): void {
  if ("cursor" in cursor) {
    cursor = cursor.cursor();
  }
  for (;;) {
    let node = cursorNode(cursor);
    let leave = false;
    if (node.from <= to && node.to >= from) {
      const enter =
        !node.type.isAnonymous &&
        (includeParents || (node.from >= from && node.to <= to));
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
      leave = cursor.type.isAnonymous;
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
  includeParents?: boolean;
};

export function printTree(
  cursor: TreeCursor | Tree | SyntaxNode,
  input: Input | string,
  { from, to, start = 0, includeParents }: PrintTreeOptions = {}
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
    includeParents,
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
        (node.type.isError || !validator.state.valid
          ? colorize(node.type.name, Color.Red)
          : isTop
          ? colorize(node.type.name, Color.Cyan)
          : node.type.name) +
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
