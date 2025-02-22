import { MatchRuleDefinition } from "../types/GrammarDefinition";

export const isMatchRuleDefinition = (
  obj: unknown
): obj is MatchRuleDefinition => {
  const item = obj as MatchRuleDefinition;
  return Boolean(item.match);
};
