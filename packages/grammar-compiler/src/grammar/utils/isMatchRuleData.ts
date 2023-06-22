import { MatchRuleDefinition } from "../types/GrammarDefinition";

export const isMatchRuleData = (obj: unknown): obj is MatchRuleDefinition => {
  const item = obj as MatchRuleDefinition;
  return Boolean(item.match);
};
