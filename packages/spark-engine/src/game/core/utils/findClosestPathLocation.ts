import { ScriptLocation } from "../types/ScriptLocation";

export const findClosestPathLocation = (
  breakpoint: { file: string; line: number },
  pathLocationEntries: [string, ScriptLocation][],
  scripts: string[]
): [string, ScriptLocation] | null => {
  const breakpointScriptIndex = scripts.indexOf(breakpoint.file);
  const breakpointLine = breakpoint.line;

  // Step 1: Filter only relevant instructions with the same scriptIndex
  const relevantLocations = pathLocationEntries.filter(
    ([, location]) => location[0] === breakpointScriptIndex
  );

  // Step 2: Check for an exact match within startLine and endLine
  for (let i = 0; i < relevantLocations.length; i++) {
    const [, location] = relevantLocations[i]!;
    const [, startLine, , endLine] = location;

    if (breakpointLine >= startLine && breakpointLine <= endLine) {
      return relevantLocations[i]!; // Exact match found
    }

    if (startLine > breakpointLine && endLine > breakpointLine) {
      // We've passed the breakpoint line, so return
      return relevantLocations[i]!;
    }
  }

  return null; // No valid instructions for this script
};
