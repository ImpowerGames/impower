import GrammarState from "../classes/GrammarState";
import Matched from "../classes/Matched";
import { tryEndMatch } from "./tryEndMatch";
import { tryPatternsMatch } from "./tryPatternsMatch";

/**
 * Runs a match against a string (starting from a given position).
 *
 * @param state - The {@link GrammarState} to run the match with.
 * @param str - The string to match.
 * @param pos - The position to start matching at.
 * @param offset - The offset to apply to the resulting {@link Matched}'s
 *   `from` position.
 */
export const tryMatch = (
  state: GrammarState,
  str: string,
  pos: number,
  offset = 0
): Matched | null => {
  const endMatched = tryEndMatch(state, str, pos, offset);
  if (endMatched) {
    // Scope ended, stop matching
    return endMatched;
  }
  // Continue trying to find a matching pattern
  return tryPatternsMatch(state, str, pos, offset);
};
