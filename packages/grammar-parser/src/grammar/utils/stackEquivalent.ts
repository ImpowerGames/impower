import { GrammarStackElement } from "../types/GrammarStackElement";

export const stackEquivalent = (
  a: GrammarStackElement,
  b: GrammarStackElement
) => {
  // do quick checks first
  if (
    a.node !== b.node ||
    a.end !== b.end ||
    a.rules.length !== b.rules.length
  ) {
    return false;
  }
  for (let i = 0; i < a.rules.length; i++) {
    if (a.rules[i] !== b.rules[i]) {
      return false;
    }
  }
  return true;
};
