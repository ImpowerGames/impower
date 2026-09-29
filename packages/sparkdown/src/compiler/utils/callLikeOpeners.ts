/**
 * The openers the formatter glues to a word before them, as in a call or an
 * index (`f(x)`, `f{1}`, `a[1]`). After a keyword or a logical operator
 * (`return {1}`, `x or {}`) the same openers take a forced space instead, so
 * both rules read this one set.
 */
export const CALL_LIKE_OPENERS: ReadonlySet<string> = new Set(["(", "[", "{"]);
