// The display() lowering's pathLocation COVERAGE. The screenplay preview's
// click-to-line routing needs every display line to map to a path, and no
// spurious extra lines. Each synthesized display() FunctionCall is stamped with
// its source range in `buildDisplayCall`. The expected SET of covered source
// lines (0-based) of each fixture was captured from the flat-text lowering the
// calls replaced (commit ffd59219a, the option `experimentalDisplayCalls` off).

import { describe, expect, test, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { startLineAtRow } from "../../compiler/utils/pathLocationTable";

function coveredLines(source: string): number[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
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
// by its own line. Each maps to its body and its covered lines.
const PRODUCERS: Record<string, [body: string, lines: number[]]> = {
  "a tagged line": [
    `  The bell rings. # ominous\n  HERO: Goodbye. # final`,
    [6, 7, 8, 12, 13, 18],
  ],
  "a write with no layer": [`  @: Layerless line.`, [6, 7, 11, 12, 17]],
  "an empty body": [`  $:\n  After the heading.`, [6, 7, 8, 12, 13, 18]],
  "a load line": [
    `  load overworld\n  The world appears.`,
    [6, 7, 8, 12, 13, 18],
  ],
  "a mid-line divert": [`  We hurried home to -> later`, [6, 7, 11, 12, 17]],
  "a mid-line load divert": [
    `  We hurried home to -> load later`,
    [6, 7, 11, 12, 17],
  ],
  "an asset line": [
    `  [[show backdrop BG]]\n  After the asset.`,
    [6, 7, 8, 12, 13, 18],
  ],
  "a load arrow": [`  -> load later`, [6, 7, 11, 12, 17]],
  "a single-line alternator": [
    `  queue | A # t | B end\n  After the alternator.`,
    [6, 8, 12, 13, 18],
  ],
  "a bare {expr} line and a chain": [
    `  {1 + 2}\n  {1}{2}\n  After the expressions.`,
    [6, 7, 8, 9, 13, 14, 19],
  ],
  "a print() call": [`  & f()\n  After the print.`, [6, 8, 12, 13, 18]],
  "picked choices": [
    `  choose\n    * Take it # picked\n    * Leave it -> later\n  end`,
    [6, 14, 15, 20],
  ],
};

// Error diagnostics of a compile, so a fixture that does not compile cleanly
// cannot pass on a partial path table. An error the compiler
// cannot place in the source (`getDiagnostic` drops a column below zero) is
// only logged, as `console.warn("HIDDEN", message, severity, ...)`, so the
// log is read too.
function compileErrors(source: string) {
  const hidden: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    if (args[0] === "HIDDEN" && args[2] === 1) hidden.push(String(args[1]));
  });
  try {
    return [...placedErrors(source), ...hidden];
  } finally {
    warn.mockRestore();
  }
}

function placedErrors(source: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
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

describe("pathLocation coverage", () => {
  for (const [label, [body, lines]] of Object.entries(PRODUCERS)) {
    test(`${label} covers its source lines`, () => {
      const source = producerScene(body);
      expect(compileErrors(source)).toEqual([]);
      expect(coveredLines(source)).toEqual(lines);
    });
  }

  test("a glued chain covers its source lines", () => {
    expect(coveredLines(GLUED)).toEqual([6, 7, 8, 9, 10, 11, 12, 14, 16]);
  });

  test("each display line type covers its source line", () => {
    expect(coveredLines(FIXTURE)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });

  test("multi-scene line offsets are preserved", () => {
    expect(coveredLines(MULTI_SCENE)).toEqual([2, 3, 6, 7, 8]);
  });
});
