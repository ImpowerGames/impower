import { NumberExpression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { ObjectExpression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import type { Expression } from "../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";

export const OPEN_DISPLAY_KEYS: ReadonlySet<string> = new Set([
  "open",
  "glue",
  "caption",
]);

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

export const displayLeavesLineOpen = (args: readonly Expression[]): boolean => {
  for (const key of OPEN_DISPLAY_KEYS) {
    if (displayTableFlag(args, key)) {
      return true;
    }
  }
  return false;
};
