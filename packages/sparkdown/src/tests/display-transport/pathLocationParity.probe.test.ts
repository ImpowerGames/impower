// INVESTIGATIVE PROBE (not a permanent gate): does the display() lowering
// preserve pathLocation COVERAGE? The runtime paths differ (different
// bytecode), but the screenplay preview's click-to-line routing only needs
// every source line that was reachable before to still map to SOME path. This
// compares the SET of covered source lines flag-on vs flag-off.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function coveredLines(source: string, experimentalDisplayCalls: boolean): number[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    experimentalDisplayCalls,
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const locs = (result.program as any).pathLocations ?? {};
  const lines = new Set<number>();
  for (const loc of Object.values(locs) as any[]) {
    // ScriptLocation: [scriptIndex, startLine, startCol, endLine, endCol].
    if (Array.isArray(loc) && typeof loc[1] === "number") lines.add(loc[1]);
  }
  return [...lines].sort((a, b) => a - b);
}

const FIXTURE = `define HERO as character with
  name = "HERO"
end

-> start

scene start
  The room is quiet.
  HERO: Hello there.
  You have {1 + 1} apples.
  HERO: First part. >
  Second part.
  The end.
end
`;

// SKIPPED — documents a KNOWN cutover blocker. The display() lowering currently
// does NOT surface per-statement pathLocations (the synthesized FunctionCall /
// ObjectExpression / StringExpression runtime objects don't carry per-line
// source debugMetadata into the compiler's pathLocation extraction), so every
// display line collapses to its scene header. That breaks the screenplay
// preview's click-to-line routing. The flag must not become the production
// default until this is fixed; un-skip this as the gate when fixing it.
describe.skip("PROBE: pathLocation coverage parity (KNOWN GAP)", () => {
  test("display() covers the same source lines as legacy", () => {
    const legacy = coveredLines(FIXTURE, false);
    const viaDisplay = coveredLines(FIXTURE, true);
    // eslint-disable-next-line no-console
    console.log("legacy lines:", legacy.join(","));
    // eslint-disable-next-line no-console
    console.log("display lines:", viaDisplay.join(","));
    // Every line legacy covered must still be covered by display().
    const missing = legacy.filter((l) => !viaDisplay.includes(l));
    expect(missing).toEqual([]);
  });
});
