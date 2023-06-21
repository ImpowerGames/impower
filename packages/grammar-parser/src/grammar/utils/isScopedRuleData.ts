import { ScopedRuleDefinition } from "../types/GrammarDefinition";

export const isScopedRuleData = (obj: unknown): obj is ScopedRuleDefinition => {
  const item = obj as ScopedRuleDefinition;
  return Boolean(item.begin);
};
