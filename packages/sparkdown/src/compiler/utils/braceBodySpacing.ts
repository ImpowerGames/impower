import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";
import { closingBrace } from "./oneLineTableBraces";

export interface BraceSpacingMark {
  type: "keyword_separator" | "extra";
  from: number;
  to: number;
}

type Read = (from: number, to: number) => string;

const BLOCK_NAMES = nodeNameSet([
  "LuauSparkleElementBlock",
  "LuauStructBlockBody",
  "LuauStructListBlock",
]);

const HANDLER_CLOSURE = "LuauSparkleHandlerClosure";

const BRACE_LINE_NAMES = nodeNameSet([
  "LuauSparkleBlockLine",
  "LuauStructBlockLine",
]);

const isBlank = (c: string) => c === " " || c === "\t";
const isLineBreak = (c: string) => c === "\n" || c === "\r" || c === "";

function blankRunStart(pos: number, read: Read): number {
  let from = pos;
  while (from > 0 && isBlank(read(from - 1, from))) from -= 1;
  return from;
}

function blankRunEnd(pos: number, read: Read): number {
  let to = pos;
  while (isBlank(read(to, to + 1))) to += 1;
  return to;
}

function startsLine(pos: number, read: Read): boolean {
  const from = blankRunStart(pos, read);
  return from === 0 || isLineBreak(read(from - 1, from));
}

function isInsideBraceLine(node: SyntaxNode): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (BRACE_LINE_NAMES.has(p.name)) return true;
  }
  return false;
}

function innerSpacing(
  open: number,
  close: number,
  read: Read,
  marks: BraceSpacingMark[],
) {
  const inside = read(open + 1, close);
  if (/[\r\n]/.test(inside)) return;
  if (!inside.trim()) {
    if (inside) marks.push({ type: "extra", from: open + 1, to: close });
    return;
  }
  marks.push(
    {
      type: "keyword_separator",
      from: open + 1,
      to: blankRunEnd(open + 1, read),
    },
    {
      type: "keyword_separator",
      from: blankRunStart(close, read),
      to: close,
    },
  );
}

function spacingBeforeBlock(open: number, read: Read, marks: BraceSpacingMark[]) {
  if (startsLine(open, read)) return;
  const gapFrom = blankRunStart(open, read);
  const before = read(gapFrom - 1, gapFrom);
  if (before === "=") {
    marks.push({ type: "keyword_separator", from: gapFrom, to: open });
    const eq = gapFrom - 1;
    if (!startsLine(eq, read)) {
      marks.push({
        type: "keyword_separator",
        from: blankRunStart(eq, read),
        to: eq,
      });
    }
    return;
  }
  if ("{[(;,".includes(before)) return;
  marks.push({ type: "keyword_separator", from: gapFrom, to: open });
}

function spacingAroundSeparator(
  node: SyntaxNode,
  read: Read,
  marks: BraceSpacingMark[],
) {
  if (read(node.from, node.from + 1) !== ";") return;
  const from = blankRunStart(node.from, read);
  if (
    from < node.from &&
    !startsLine(node.from, read) &&
    read(from - 1, from) !== "{"
  ) {
    marks.push({ type: "extra", from, to: node.from });
  }
  const after = node.from + 1;
  const to = blankRunEnd(after, read);
  if (!isLineBreak(read(to, to + 1))) {
    marks.push({ type: "keyword_separator", from: after, to });
  }
}

export function braceBodySpacing(
  node: SyntaxNode,
  read: Read,
): BraceSpacingMark[] {
  const marks: BraceSpacingMark[] = [];
  if (BLOCK_NAMES.has(node.name)) {
    if (read(node.from, node.from + 1) !== "{") return marks;
    spacingBeforeBlock(node.from, read, marks);
    const close = closingBrace(node, read);
    if (close != null) innerSpacing(node.from, close, read, marks);
  } else if (node.name === HANDLER_CLOSURE) {
    if (read(node.from, node.from + 1) !== "{") return marks;
    if (!isInsideBraceLine(node)) return marks;
    const close = closingBrace(node, read);
    if (close != null) innerSpacing(node.from, close, read, marks);
  } else if (node.name === "LuauStructBlockSeparator") {
    spacingAroundSeparator(node, read, marks);
  }
  return marks;
}

export function isInStructBlockKey(node: SyntaxNode): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === "LuauStructBlockKey") return true;
    if (BRACE_LINE_NAMES.has(p.name)) return false;
  }
  return false;
}

export function isSpacedBraceEdge(node: SyntaxNode, read: Read): boolean {
  for (let p = node.parent; p; p = p.parent) {
    const spaced =
      BLOCK_NAMES.has(p.name) ||
      (p.name === HANDLER_CLOSURE && isInsideBraceLine(p));
    if (!spaced) {
      if (BRACE_LINE_NAMES.has(p.name)) return false;
      continue;
    }
    if (read(p.from, p.from + 1) !== "{") return false;
    const close = closingBrace(p, read);
    if (close == null) return false;
    const atEdge =
      blankRunStart(node.from, read) === p.from + 1 ||
      blankRunEnd(node.to, read) === close;
    if (!atEdge) return false;
    const inside = read(p.from + 1, close);
    return !/[\r\n]/.test(inside) && inside.trim() !== "";
  }
  return false;
}

export function keepsSpaceBeforeClass(node: SyntaxNode): boolean {
  const next = node.nextSibling;
  if (next?.name !== "LuauSparkleElementClass") return false;
  let parts: SyntaxNode | null = node.parent;
  while (parts && parts.name !== "LuauSparkleElementParts") {
    parts = parts.parent;
  }
  if (!parts) return false;
  const prev = node.prevSibling;
  if (prev) return prev.name !== "LuauSparkleElementClass";
  const content = parts.parent;
  if (parts.prevSibling || content?.name !== "LuauSparkleElement_content") {
    return true;
  }
  const begin = content.prevSibling;
  if (begin?.name !== "LuauSparkleElement_begin" || begin.to !== node.from) {
    return true;
  }
  const name = begin.firstChild;
  return !name || name.to !== begin.to;
}
