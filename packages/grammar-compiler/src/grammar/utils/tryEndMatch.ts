import GrammarState from "../classes/GrammarState";
import ScopedRule from "../classes/rules/ScopedRule";
import { Wrapping } from "../enums/Wrapping";

export const tryEndMatch = (
  state: GrammarState,
  str: string,
  pos: number,
  offset = 0
) => {
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
  return null;
};
