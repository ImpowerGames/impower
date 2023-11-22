import { ScopedRuleDefinition } from "../types/GrammarDefinition";

export const isScopedRuleDefinition = (
  obj: unknown
): obj is ScopedRuleDefinition => {
  const item = obj as ScopedRuleDefinition;
  return Boolean(item.begin);
};
