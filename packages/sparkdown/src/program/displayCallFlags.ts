import { NumberExpression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { ObjectExpression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import type { Expression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";

/** The keys of a `display` table that leave its line without a newline, so
 *  the beat runs on past the call: `open` joins what follows, `glue` and
 *  `caption` leave the newline waiting. */
export const OPEN_DISPLAY_KEYS: ReadonlySet<string> = new Set([
  "open",
  "glue",
  "caption",
]);

/** Whether the table a `display` call is given carries `key` set to `true`,
 *  as the lowering marks a flag (`displayCall.ts`, `flagEntry`). */
export const displayTableFlag = (
  args: readonly Expression[],
  key: string,
): boolean => {
  const table = args[0];
  if (!(table instanceof ObjectExpression)) {
    return false;
  }
  return table.entries.some(
    (entry) =>
      entry.key === key &&
      entry.value instanceof NumberExpression &&
      entry.value.isBool() &&
      entry.value.value === true,
  );
};

/** Whether a `display` call writes no newline after its line. */
export const displayLeavesLineOpen = (args: readonly Expression[]): boolean => {
  for (const key of OPEN_DISPLAY_KEYS) {
    if (displayTableFlag(args, key)) {
      return true;
    }
  }
  return false;
};
