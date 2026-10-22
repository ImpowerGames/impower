import type { SyntaxNode } from "@lezer/common";
import { isTrivia } from "../lint/luauTree";

// Whether a line of a `define` body that begins with `name(` is a method's
// header or a call is decided here, once, from the tree (I-1411). The grammar
// opens `LuauMethodDefinition` at `name(`, since no pattern on that line can
// see the next one, and ends it at the start of the first code line that is
// not indented deeper than the header, unless that line is the method's own
// `end` at the header's indentation. A method holds the lines indented below
// its header or takes that `end`; a candidate that took neither is the line
// it stands on, a statement of the define's body (`print("x")`), which Luau
// reads as one: no method, no missing `end` of its own, and no parameter list
// to report. Which child holds the header's line break (a return type takes
// it in) decides nothing: a body is any token on a later line.

/** Whether `node`'s subtree holds a `LuauEndKeyword`. */
function holdsEndKeyword(node: SyntaxNode): boolean {
  const cursor = node.cursor();
  while (cursor.next() && cursor.from < node.to) {
    if (cursor.name === "LuauEndKeyword") return true;
  }
  return false;
}

/**
 * Whether `node` is a `LuauMethodDefinition` that is a statement line of its
 * define's body, not a method; `lineOf` gives a document position's line.
 */
export function isDefineMethodCall(node: SyntaxNode, lineOf: (pos: number) => number): boolean {
  if (node.name !== "LuauMethodDefinition") return false;
  const end = node.getChild("LuauMethodDefinition_end");
  if (end && holdsEndKeyword(end)) return false;
  const content = node.getChild("LuauMethodDefinition_content");
  if (!content) return true;
  // A token of the content on a later line than the header is the body's.
  const headerLine = lineOf(node.from);
  const cursor = content.cursor();
  while (cursor.next() && cursor.from < content.to) {
    if (cursor.node.firstChild || isTrivia(cursor.node)) continue;
    if (lineOf(cursor.from) > headerLine) return false;
  }
  return true;
}
