import { type SyntaxNode } from "@lezer/common";

// A comma between two items of a list: `LuauCommaSeparator`, or, in Luau
// code, `LuauCommaLineBreak`, a comma that ends its line and also holds the
// line break and any comment before the next item. Every consumer of a list
// that includes `LuauCommaLineBreak` (the lowerers, the lints) asks this
// rather than naming the nodes.
export function isListCommaName(name: string | undefined): boolean {
  return name === "LuauCommaSeparator" || name === "LuauCommaLineBreak";
}

// The if expression a `LuauCommaLineBreak` holds after its line break, when
// the next line starts with one unindented (`local a, g = 1,` or
// `a, g = 1,` then `if c`): the declaration or reassignment cannot read it
// there, so the comma does, and it is the list's next value.
export function commaLineBreakValue(comma: SyntaxNode): SyntaxNode | null {
  if (comma.name !== "LuauCommaLineBreak") return null;
  const content = comma.getChild("LuauCommaLineBreak_content");
  return content?.getChild("LuauTernaryExpression") ?? null;
}
