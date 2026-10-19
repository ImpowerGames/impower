import { type SyntaxNode } from "@lezer/common";
import { isExplicitRuleName } from "../../utils/explicitRuleNames";

/**
 * The value an assignment's line break holds (`LuauAssignmentLineBreak`,
 * after an `=` with no value on its line): an if expression that begins a
 * later line, or nothing when it holds only the comments, line breaks and
 * whitespace before a value the operation reads after it
 * (`LuauCommaLineBreakGap`).
 */
export function lineBreakValues(lineBreak: SyntaxNode): SyntaxNode[] {
  const content = lineBreak.getChild("LuauAssignmentLineBreak_content");
  const values: SyntaxNode[] = [];
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!isExplicitRuleName(child.name, "LuauCommaLineBreakGap")) values.push(child);
  }
  return values;
}
