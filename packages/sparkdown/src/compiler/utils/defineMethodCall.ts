import type { SyntaxNode } from "@lezer/common";
import { isTrivia } from "../lint/luauTree";

// Whether a line of a `define` body that begins with `name(` is a method's
// header or a call is decided here, once, from the tree (I-1411). The grammar
// opens `LuauMethodDefinition` at `name(`, since no pattern on that line can
// see the next one, and ends it before a code line at the header's own
// indentation that is not its `end`, or before an `end` written left of the
// header (`LUAU_METHOD_LINE_AFTER_BODY`); any other line, a less indented one
// included, stays in the method. A candidate that took no `end` and holds no
// line below its header is the line it stands on, a statement of the
// define's body (`print("x")`), which Luau
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
  // A token on a later line than the header's first is the body's, unless
  // the header holds it: a parameter list or return type that goes on at the
  // next line (`print(1,` then `2)`).
  const headerLine = lineOf(node.from);
  const holdsLaterToken = (n: SyntaxNode): boolean => {
    if (!n.firstChild) return !isTrivia(n) && lineOf(n.from) > headerLine;
    for (let child: SyntaxNode | null = n.firstChild; child; child = child.nextSibling) {
      if (holdsLaterToken(child)) return true;
    }
    return false;
  };
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (!HEADER_PARTS.has(child.name) && holdsLaterToken(child)) return false;
  }
  return true;
}

/** The parts of a method's header that its content holds before the body. */
const HEADER_PARTS: ReadonlySet<string> = new Set([
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauFunctionReturnMissingType",
]);
