import {
  ScopedRuleDefinition,
  SwitchRuleDefinition,
} from "../types/GrammarDefinition";

export const isSwitchRuleData = (obj: unknown): obj is SwitchRuleDefinition => {
  return Boolean(
    (obj as SwitchRuleDefinition).patterns &&
      !(obj as ScopedRuleDefinition).begin
  );
};
