export const GLUED_ALTERNATOR_BLOCKS: ReadonlySet<string> = new Set([
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
]);

export type GluedAlternatorJoin = "before" | "between" | "after";

export const gluedAlternatorJoin = (join: GluedAlternatorJoin): string => {
  switch (join) {
    case "before":
      return " ";
    case "between":
      return " / ";
    case "after":
      return "";
  }
};
