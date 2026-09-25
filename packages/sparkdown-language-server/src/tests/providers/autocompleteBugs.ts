// The Bugs the autocomplete port exposed. Each skipped case names one of these,
// and the manifest test refuses a skipped case whose Bug number is missing.
export const BUG = {
  /** Identifier and divert completion throw once any script declares a `define`. */
  defineCrash: 0,
  /** Luau locals and parameters are offered outside their scope and before their declaration. */
  localScope: 0,
  /** Function and define names are never offered. */
  functions: 0,
  /** The standard library (`table`, `math`, `string`) and its functions are never offered. */
  globals: 0,
  /** A position with nothing typed yet offers no names. */
  emptySlot: 0,
  /** A partly typed word in Luau code offers no keywords. */
  keywordPrefix: 0,
  /** Keywords ignore where the cursor sits inside a statement. */
  keywordPosition: 0,
  /** Suggestions are offered inside comments and string literals. */
  comments: 0,
  /** Table and define fields and methods are not offered after `.` or `:`. */
  members: 0,
  /** A define body offers none of its type's fields or values. */
  defineFields: 0,
  /** Sparkle `#prop` and `@event` attributes offer nothing. */
  sparkleAttributes: 0,
} as const;
