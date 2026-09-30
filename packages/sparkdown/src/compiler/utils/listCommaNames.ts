// A comma between two items of a list: `LuauCommaSeparator`, or, in Luau
// code, `LuauCommaLineBreak`, a comma that ends its line and also holds the
// line break and any comment before the next item. Every consumer of a list
// that includes `LuauCommaLineBreak` (the lowerers, the lints) asks this
// rather than naming the nodes.
export function isListCommaName(name: string | undefined): boolean {
  return name === "LuauCommaSeparator" || name === "LuauCommaLineBreak";
}
