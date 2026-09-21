// GATE: the display() lowering must preserve pathLocation COVERAGE. The runtime
// paths differ (different bytecode), but the screenplay preview's click-to-line
// routing needs every source line that was reachable before to still map to a
// path — and no spurious extra lines. This compares the SET of covered source
// lines flag-on vs flag-off (both directions). Preserved by stamping each
// synthesized display() FunctionCall with its source range in `buildDisplayCall`.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { startLineAtRow } from "../../compiler/utils/pathLocationTable";

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
  const table = result.program.pathLocations;
  const lines = new Set<number>();
  for (let row = 0; row < (table?.paths.length ?? 0); row++) {
    lines.add(startLineAtRow(table!, row));
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

// Glued chains: every line lowers to its own stamped display() call.
const GLUED = `define HERO as character with
  name = "HERO"
end

-> start

scene start
  Some
  .. content
  .. with glue.
  HERO: Wait ..
  right there.
  You see a
  if true then
    .. red door.
  end
  The end.
end
`;

describe("pathLocation coverage parity", () => {
  test("a glued chain covers the same source lines", () => {
    const covered = coveredLines(GLUED, true);
    expect(covered.length).toBeGreaterThan(0);
    expect(covered).toEqual(coveredLines(GLUED, false));
  });

  test("display() covers exactly the same source lines as legacy", () => {
    const covered = coveredLines(FIXTURE, true);
    // Two empty lists are equal, so the comparison below only means something
    // once there is coverage to compare.
    expect(covered.length).toBeGreaterThan(0);
    expect(covered).toEqual(coveredLines(FIXTURE, false));
  });

  test("multi-scene line offsets are preserved", () => {
    const covered = coveredLines(MULTI_SCENE, true);
    expect(covered.length).toBeGreaterThan(0);
    expect(covered).toEqual(coveredLines(MULTI_SCENE, false));
  });
});
