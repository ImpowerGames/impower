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
// to report.

/** Whether `node` is a `LuauMethodDefinition` that is a statement line of its define's body, not a method. */
export function isDefineMethodCall(node: SyntaxNode): boolean {
  if (node.name !== "LuauMethodDefinition") return false;
  const end = node.getChild("LuauMethodDefinition_end");
  if (end?.getChild("LuauMethodDefinition_end_c2")?.getChild("LuauEndKeyword")) return false;
  const content = node.getChild("LuauMethodDefinition_content");
  let lineBroken = false;
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (child.name === "Newline") lineBroken = true;
    else if (lineBroken && !isTrivia(child)) return false;
  }
  return true;
}
