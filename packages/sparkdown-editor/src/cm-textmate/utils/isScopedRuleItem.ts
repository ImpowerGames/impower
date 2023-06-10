import { ScopedRuleItem } from "../grammar/types/definition";

export const isScopedRuleItem = (obj: unknown): obj is ScopedRuleItem => {
  const item = obj as ScopedRuleItem;
  return Boolean(item.begin);
};
