/**
 * The state-aware builtins a statement chunk may call, dispatched through
 * their `STDLIB` entries (`src/inkjs/engine/StdLib.ts`) with the program
 * engine as the story. A builtin joins this list when the engine presents
 * everything its entry reads of the story; a call to any other builtin is a
 * construct the writer does not emit, named by the builtin.
 *
 * `display` reads the output stream and the pending line end, and raises a
 * warning; `__unjoined` raises a warning. `__def` and `__defs`, which a
 * `define` initializes its table with, read and write the globals.
 * `tonumber`, which a numeric `for` coerces its bounds with, reads nothing.
 * `__adjust_iter`, which a generic `for` adjusts its iterator with, calls a
 * table's `__iter` metamethod through the story.
 */
export const PROGRAM_BUILTINS: ReadonlySet<string> = new Set([
  "display",
  "__unjoined",
  "__def",
  "__defs",
  "tonumber",
  "__adjust_iter",
]);

/** The keys of a `display` table that leave its line without a newline, so
 *  the beat runs on past the call: `open` joins what follows, `glue` and
 *  `caption` leave the newline waiting. */
export const OPEN_DISPLAY_KEYS: ReadonlySet<string> = new Set([
  "open",
  "glue",
  "caption",
]);
