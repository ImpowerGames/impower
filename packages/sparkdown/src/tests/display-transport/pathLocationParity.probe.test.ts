// GATE: the display() lowering must preserve pathLocation COVERAGE. The runtime
// paths differ (different bytecode), but the screenplay preview's click-to-line
// routing needs every source line that was reachable before to still map to a
// path — and no spurious extra lines. This compares the SET of covered source
// lines flag-on vs flag-off (both directions). Preserved by stamping each
// synthesized display() FunctionCall with its source range in `buildDisplayCall`.

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
  This is **bold** text.
  ^: A Title
  $: INT. HOUSE - DAY
  %: CUT TO:
  HERO (sad): I feel {2 * 2}.
  HERO: First part. >
  Second part.
  The end.
end
`;

// A separate scene exercises cross-scene line offsets.
const MULTI_SCENE = `-> one

scene one
  First scene line.
  -> two

scene two
  Second scene line.
  Another line here.
end
`;

describe("pathLocation coverage parity", () => {
  test("display() covers exactly the same source lines as legacy", () => {
    expect(coveredLines(FIXTURE, true)).toEqual(coveredLines(FIXTURE, false));
  });

  test("multi-scene line offsets are preserved", () => {
    expect(coveredLines(MULTI_SCENE, true)).toEqual(
      coveredLines(MULTI_SCENE, false),
    );
  });
});
