// GATE: the display() lowering must preserve pathLocation COVERAGE. The runtime
// paths differ (different bytecode), but the screenplay preview's click-to-line
// routing needs every source line that was reachable before to still map to a
// path — and no spurious extra lines. This compares the SET of covered source
// lines flag-on vs flag-off (both directions). Preserved by stamping each
// synthesized display() FunctionCall with its source range in `buildDisplayCall`.

import { describe, expect, test, vi } from "vitest";
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

// One scene per producer, so a producer that loses or gains coverage shows up
// by its own line.
const PRODUCERS: Record<string, string> = {
  "a tagged line": `  The bell rings. # ominous\n  HERO: Goodbye. # final`,
  "a write with no layer": `  @: Layerless line.`,
  "an empty body": `  $:\n  After the heading.`,
  "a load line": `  load overworld\n  The world appears.`,
  "a mid-line divert": `  We hurried home to -> later`,
  "a mid-line load divert": `  We hurried home to -> load later`,
  "an asset line": `  [[show backdrop BG]]\n  After the asset.`,
  "a load arrow": `  -> load later`,
  "a single-line alternator": `  queue | A # t | B end\n  After the alternator.`,
  "a bare {expr} line and a chain": `  {1 + 2}\n  {1}{2}\n  After the expressions.`,
  "a print() call": `  & f()\n  After the print.`,
  "picked choices": `  choose\n    * Take it # picked\n    * Leave it -> later\n  end`,
};

// Error diagnostics of a compile, so a fixture that does not compile cleanly
// cannot pass by comparing two partial path tables. An error the compiler
// cannot place in the source (`getDiagnostic` drops a column below zero) is
// only logged, as `console.warn("HIDDEN", message, severity, ...)`, so the
// log is read too.
function compileErrors(source: string, experimentalDisplayCalls: boolean) {
  const hidden: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    if (args[0] === "HIDDEN" && args[2] === 1) hidden.push(String(args[1]));
  });
  try {
    return [...placedErrors(source, experimentalDisplayCalls), ...hidden];
  } finally {
    warn.mockRestore();
  }
}

function placedErrors(source: string, experimentalDisplayCalls: boolean) {
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
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  return Object.values(result.program.diagnostics ?? {})
    .flat()
    .filter((d: any) => d?.severity === 1)
    .map((d: any) => d.message);
}

function producerScene(body: string) {
  return `define HERO as character with
  name = "HERO"
end

-> start

scene start
${body}
  done
end

scene later
  Savile Row.
  done
end

function f()
print("hi")
end
`;
}

describe("pathLocation coverage parity", () => {
  for (const [label, body] of Object.entries(PRODUCERS)) {
    test(`${label} covers the same source lines`, () => {
      const source = producerScene(body);
      expect(compileErrors(source, true)).toEqual([]);
      const covered = coveredLines(source, true);
      expect(covered.length).toBeGreaterThan(0);
      expect(covered).toEqual(coveredLines(source, false));
    });
  }

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
