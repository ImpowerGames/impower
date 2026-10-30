import type { SyntaxNode } from "@lezer/common";
import {
  ALL_INLINE_ALTERNATOR_NAMES,
  isInsideOneLineAlternator,
} from "./inlineAlternators";
import { nodeNameSet } from "./nodeNameSet";

const SPACED_TABLE_NAMES = nodeNameSet(["LuauTable", "LuauTypeTableStruct"]);

export function closingBrace(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): number | null {
  for (let child = node.lastChild; child; child = child.prevSibling) {
    if (child.name === `${node.name}_end`) {
      return read(child.from, child.from + 1) === "}" ? child.from : null;
    }
  }
  return null;
}

function isSpacedTable(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean {
  return (
    SPACED_TABLE_NAMES.has(node.name) &&
    read(node.from, node.from + 1) === "{" &&
    !isInsideOneLineAlternator(node, read, ALL_INLINE_ALTERNATOR_NAMES)
  );
}

export function oneLineTableBraces(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): { open: number; close: number } | null {
  if (!isSpacedTable(node, read)) return null;
  const close = closingBrace(node, read);
  if (close == null) return null;
  const inside = read(node.from + 1, close);
  if (!inside.trim() || /[\r\n]/.test(inside)) return null;
  return { open: node.from, close };
}

function isTableBrace(
  node: SyntaxNode,
  pos: number,
  read: (from: number, to: number) => string,
): boolean {
  for (
    let owner: SyntaxNode | null = node.resolveInner(pos, 1);
    owner;
    owner = owner.parent
  ) {
    if (SPACED_TABLE_NAMES.has(owner.name)) {
      return owner.from === pos || closingBrace(owner, read) === pos;
    }
  }
  return false;
}

export function tableOuterGaps(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): { before: number | null; after: number | null } {
  const gaps = { before: null as number | null, after: null as number | null };
  if (!isSpacedTable(node, read)) return gaps;
  let prev = node.from - 1;
  while (prev >= 0 && /[ \t]/.test(read(prev, prev + 1))) prev -= 1;
  if (prev >= 0 && read(prev, prev + 1) === "{" && !isTableBrace(node, prev, read)) {
    gaps.before = node.from;
  }
  const close = gaps.before == null ? null : closingBrace(node, read);
  if (close != null) {
    let next = close + 1;
    while (/[ \t]/.test(read(next, next + 1))) next += 1;
    if (read(next, next + 1) === "}" && !isTableBrace(node, next, read)) {
      gaps.after = close + 1;
    }
  }
  return gaps;
}
