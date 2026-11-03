import { type SyntaxNode } from "@lezer/common";
import { COMMENT, NEUTRAL } from "../typecheck/LuauUnitNodes";

export function propClosureHoldsExpression(closure: SyntaxNode): boolean {
  const content = closure.getChild("LuauSparklePropClosure_content");
  for (let c = content?.firstChild; c; c = c.nextSibling) {
    if (!NEUTRAL.test(c.name) && !COMMENT.test(c.name)) return true;
  }
  return false;
}
