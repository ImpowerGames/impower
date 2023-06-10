import { ScopedRuleItem, SwitchRuleItem } from "../grammar/types/definition";

export const isSwitchRuleItem = (obj: unknown): obj is SwitchRuleItem => {
  return Boolean(
    (obj as SwitchRuleItem).patterns && !(obj as ScopedRuleItem).begin
  );
};
