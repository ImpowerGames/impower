import { isExplicitRuleName } from "./explicitRuleNames";
import { type SyntaxNode } from "@lezer/common";

export function isListCommaName(name: string | undefined): boolean {
  return name === "LuauCommaSeparator" || isExplicitRuleName(name, "LuauCommaLineBreak");
}

export function commaLineBreakValue(comma: SyntaxNode): SyntaxNode | null {
  if (!isExplicitRuleName(comma.name, "LuauCommaLineBreak")) return null;
  const content = (comma.getChild("LuauCommaLineBreak_content") ?? comma.getChild("LuauSparkdownExplicitCommaLineBreak_content"));
  return (content?.getChild("LuauTernaryExpression") ?? content?.getChild("LuauSparkdownExplicitTernaryExpression")) ?? null;
}
