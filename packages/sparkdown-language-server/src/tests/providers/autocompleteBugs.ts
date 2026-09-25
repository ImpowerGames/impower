// The Bugs the autocomplete port exposed. Each skipped case names one of these,
// and the manifest test refuses a skipped case whose Bug number is missing.
export const BUG = {
  /** Identifier and divert completion throw once any script declares a `define`. */
  defineCrash: 859,
  /** Luau locals and parameters are offered outside their scope and before their declaration. */
  localScope: 860,
  /** Function and define names are never offered. */
  functions: 861,
  /** The standard library (`table`, `math`, `string`) and its functions are never offered. */
  globals: 862,
  /** A position with nothing typed yet offers no names. */
  emptySlot: 863,
  /** A partly typed word in Luau code offers no keywords. */
  keywordPrefix: 864,
  /** Keywords ignore where the cursor sits inside a statement. */
  keywordPosition: 865,
  /** Suggestions are offered inside comments and string literals. */
  comments: 866,
  /** Table and define fields and methods are not offered after `.` or `:`. */
  members: 867,
  /** A define body offers none of its type's fields or values. */
  defineFields: 868,
  /** Sparkle `#prop` and `@event` attributes offer nothing. */
  sparkleAttributes: 869,
} as const;
