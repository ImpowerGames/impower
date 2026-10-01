import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";
import { closingBrace } from "./oneLineTableBraces";

// The spacing rules of the brace bodies of #1222 (#1227), for the formatter.
// Indentation by block depth is the formatter's (`getDocumentFormattingEdits`);
// this file decides the whitespace around and inside the braces on a line:
//
//   column.menu #gap=16 {        one space before a block's `{`
//   row = { text "a"; text "b" } one on each side of an optional `=`, one
//                                inside each brace of a one-line block, and
//                                one after each `;` with none before it
//   button @click={ a = 1 }      one inside each brace of a one-line closure
//   row {}                       an empty block stays `{}`
//
// A mark of type `keyword_separator` is written as exactly one space and one
// of type `extra` as nothing; each covers the whitespace already there, so
// it replaces that whitespace rather than adding to it.

export interface BraceSpacingMark {
  type: "keyword_separator" | "extra";
  from: number;
  to: number;
}

type Read = (from: number, to: number) => string;

// The braces of a block: an element's children, a struct block and a list
// block. Each begins at its `{`.
const BLOCK_NAMES = nodeNameSet([
  "LuauSparkleElementBlock",
  "LuauStructBlockBody",
  "LuauStructListBlock",
]);

const HANDLER_CLOSURE = "LuauSparkleHandlerClosure";

// A line of a body that holds a brace. Only a closure on such a line is
// spaced: an indented-form line keeps the spacing it has today.
const BRACE_LINE_NAMES = nodeNameSet([
  "LuauSparkleBlockLine",
  "LuauStructBlockLine",
]);

const isBlank = (c: string) => c === " " || c === "\t";
const isLineBreak = (c: string) => c === "\n" || c === "\r" || c === "";

// The start of the run of spaces and tabs that ends at `pos`.
function blankRunStart(pos: number, read: Read): number {
  let from = pos;
  while (from > 0 && isBlank(read(from - 1, from))) from -= 1;
  return from;
}

// The end of the run of spaces and tabs that starts at `pos`.
function blankRunEnd(pos: number, read: Read): number {
  let to = pos;
  while (isBlank(read(to, to + 1))) to += 1;
  return to;
}

// Whether only spaces and tabs stand between the line's start and `pos`.
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

// One space inside each brace of a one-line block or closure, or nothing
// inside an empty one. A block that spans lines keeps its line breaks.
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

// One space before a block's `{`, and one on each side of an `=` before it.
// A `{` that starts its line is left to the indentation, and one after
// another opener or separator is left to that one's rule.
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

// No space before a `;` that separates entries and one after it, unless the
// line ends there. A `;` right after a block's `{` keeps the one space the
// `{` takes inside it.
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

/**
 * The spacing marks the formatter writes for `node` in a brace body: before
 * and inside a block's braces, around an entry's `;`, and inside a one-line
 * handler closure on a brace line. Empty for every other node.
 */
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

/**
 * Whether `node` lies in the key of a struct block (`> :last-child {`,
 * `@hovered, @pressed {`). The readers take a key's text as written, so
 * `> :last-child` and `>:last-child` are two keys; its whitespace stays.
 */
export function isInStructBlockKey(node: SyntaxNode): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === "LuauStructBlockKey") return true;
    if (BRACE_LINE_NAMES.has(p.name)) return false;
  }
  return false;
}

/**
 * Whether the whitespace `node` stands just inside a brace of a one-line
 * block or closure that `braceBodySpacing` spaces. Luau code in a closure
 * reads such whitespace as a separator, which tightens against a brace, so
 * the annotator marks it as the forced space instead: a separator edit that
 * removes it would otherwise win over the forced space wherever the space is
 * already there and the forced space has nothing to change.
 */
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
    // Most whitespace in a body separates its parts: answer that from the
    // whitespace's own run before reading the body.
    const atEdge =
      blankRunStart(node.from, read) === p.from + 1 ||
      blankRunEnd(node.to, read) === close;
    if (!atEdge) return false;
    const inside = read(p.from + 1, close);
    return !/[\r\n]/.test(inside) && inside.trim() !== "";
  }
  return false;
}

/**
 * Whether the whitespace `node` before a class in a brace element's head
 * keeps one space. A class is glued to the element's name (`text .title` →
 * `text.title`) and to a class before it (`.a .b` → `.a.b`); after anything
 * else (content, an attribute's value, a component call's arguments, a
 * word) gluing it would change what the head reads, so the space stays.
 */
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
  // The first part: glued only right after the element's name, not after a
  // component call's arguments or the `}` of a closure. The element's
  // `_begin` holds its name and then its call's arguments, empty without a
  // call; reading the tree keeps every name the grammar takes (`café`,
  // `custom-`), where a test of the character before would not.
  const content = parts.parent;
  if (parts.prevSibling || content?.name !== "LuauSparkleElement_content") {
    return true;
  }
  const begin = content.prevSibling;
  if (begin?.name !== "LuauSparkleElement_begin" || begin.to !== node.from) {
    return true;
  }
  const args = begin.lastChild;
  return args?.name === "LuauSparkleElement_begin_c2" && args.to > args.from;
}
