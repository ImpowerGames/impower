/**
 * Standard interface for a matcher of some kind. Takes a string input and
 * matches it against some sort of internal pattern.
 */
export interface Matcher {
  /** Returns if the given string is matched by a pattern. */
  test(str: string, pos?: number): boolean;
  /**
   * Returns a match array or null if did not match.
   */
  match(str: string, pos?: number): string[] | null;
}
