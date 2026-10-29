import { type SyntaxNode } from "@lezer/common";
import { isExplicitRuleName } from "../../utils/explicitRuleNames";

export function lineBreakValues(lineBreak: SyntaxNode): SyntaxNode[] {
  const content = lineBreak.getChild("LuauAssignmentLineBreak_content");
  const values: SyntaxNode[] = [];
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!isExplicitRuleName(child.name, "LuauCommaLineBreakGap")) values.push(child);
  }
  return values;
}
