import { Matched } from "../grammar/matched";
import { ScopedRule } from "../grammar/rules/scoped";
import { GrammarState } from "../grammar/state";
import { Wrapping } from "../grammar/types/wrapping";

/**
 * Runs a match against a string (starting from a given position).
 *
 * @param state - The {@link GrammarState} to run the match with.
 * @param str - The string to match.
 * @param pos - The position to start matching at.
 * @param offset - The offset to apply to the resulting {@link Matched}'s
 *   `from` position.
 */
export const match = (
  state: GrammarState,
  str: string,
  pos: number,
  offset = 0
): Matched | null => {
  if (state.stack.end) {
    if (state.stack.end instanceof ScopedRule) {
      let result = state.stack.end.close(str, pos, state);
      if (result) {
        if (offset !== pos) {
          result.offset(offset);
        }
        return result;
      }
    } else {
      let result = state.stack.end.match(str, pos, state);
      if (result) {
        if (state.stack.node) {
          result = result.wrap(state.stack.node, Wrapping.END);
        }
        result.state.stack.pop();
        if (offset !== pos) {
          result.offset(offset);
        }
        return result;
      }
    }
  }

  // normal matching
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
