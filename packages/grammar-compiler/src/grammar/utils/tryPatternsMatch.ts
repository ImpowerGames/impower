import GrammarState from "../classes/GrammarState";

export const tryPatternsMatch = (
  state: GrammarState,
  str: string,
  pos: number,
  offset = 0
) => {
  const rules = state.stack.rules;
  if (rules) {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const result = rule?.match(str, pos, state);
      if (result) {
        if (offset !== pos) {
          result.offset(offset);
        }
        return result;
      }
    }
  }

  return null;
};
