import { MatchRuleItem } from "../grammar/types/definition";

export const isMatchRuleItem = (obj: unknown): obj is MatchRuleItem => {
  const item = obj as MatchRuleItem;
  return Boolean(item.match);
};
